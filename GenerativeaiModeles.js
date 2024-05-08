const { AnyModelNameOptions, BaseModelNameOptions, TunedModelNameOptions, Model, TunedModel, ModelServiceClient, TuningExample, Dataset, TunedModelsIterable, ModelsIterable, CreateTunedModelOperation, UpdateTunedModelRequest, Operation, Hyperparameters, TuningTask } = require('google.ai.generativelanguage');
const { get_default_model_client } = require('google.generativeai.client');
const { field_mask_pb2, protobuf_helpers } = require('google.api_core');

function get_model(name, client) {
    name = make_model_name(name);
    if (name.startsWith("models/")) return get_base_model(name, client);
    else if (name.startsWith("tunedModels/")) return get_tuned_model(name, client);
    else throw new Error("Model names must start with `models/` or `tunedModels/`");
}

function get_base_model(name, client) {
    if (!client) client = get_default_model_client();
    name = make_model_name(name);
    if (!name.startsWith("models/")) throw new Error(`Base model names must start with \`models/\`, got: ${name}`);
    const result = client.get_model({ name });
    return Model.fromObject(result.toObject());
}

function get_tuned_model(name, client) {
    if (!client) client = get_default_model_client();
    name = make_model_name(name);
    if (!name.startsWith("tunedModels/")) throw new Error("Tuned model names must start with `tunedModels/`");
    const result = client.get_tuned_model({ name });
    return TunedModel.fromObject(decode_tuned_model(result.toObject()));
}

function get_base_model_name(model, client) {
    if (typeof model === "string") {
        if (model.startsWith("tunedModels/")) {
            model = get_model(model, client);
            return model.base_model;
        } else return model;
    } else if (model instanceof TunedModel) return model.base_model;
    else if (model instanceof Model) return model.name;
    else if (model instanceof ModelServiceClient) return model.name;
    else if (model instanceof TunedModel) {
        let base_model = model.base_model;
        if (!base_model) base_model = model.tuned_model_source.base_model;
        return base_model;
    } else throw new TypeError(`Cannot understand model: ${model}`);
}

function list_models(page_size, client) {
    if (!client) client = get_default_model_client();
    const models = client.list_models({ page_size });
    for (const model of models) yield Model.fromObject(model.toObject());
}

function list_tuned_models(page_size, client) {
    if (!client) client = get_default_model_client();
    const tuned_models = client.list_tuned_models({ page_size });
    for (const model of tuned_models) yield decode_tuned_model(model.toObject());
}

function create_tuned_model(source_model, training_data, { id, display_name, description, temperature, top_p, top_k, epoch_count, batch_size, learning_rate, input_key = "text_input", output_key = "output", client }) {
    if (!client) client = get_default_model_client();
    const source_model_name = make_model_name(source_model);
    const base_model_name = get_base_model_name(source_model);
    let source_model_obj;
    if (source_model_name.startsWith("models/")) source_model_obj = { base_model: source_model_name };
    else if (source_model_name.startsWith("tunedModels/")) source_model_obj = { tuned_model_source: { tuned_model: source_model_name, base_model: base_model_name } };
    else throw new Error(`Not understood: \`${source_model_name}\``);

    const training_data_encoded = encode_tuning_data(training_data, input_key, output_key);

    const hyperparameters = new Hyperparameters({
        epoch_count,
        batch_size,
        learning_rate
    });

    const tuning_task = new TuningTask({
        training_data: training_data_encoded,
        hyperparameters
    });

    const tuned_model = new TunedModel({
        ...source_model_obj,
        display_name,
        description,
        temperature,
        top_p,
        top_k,
        tuning_task
    });

    const operation = client.create_tuned_model({ tuned_model_id: id, tuned_model: tuned_model.toObject() });
    return CreateTunedModelOperation.fromCoreOperation(operation);
}

function update_tuned_model(tuned_model, updates, { client } = {}) {
    if (!client) client = get_default_model_client();

    let name;
    let field_mask;
    if (typeof tuned_model === "string") {
        name = tuned_model;
        if (!updates || typeof updates !== "object") throw new TypeError(`When calling \`update_tuned_model(name:str, updates: dict)\`, updates must be a \`dict\`. got: ${typeof updates}`);
        tuned_model = client.get_tuned_model({ name });
        updates = flatten_update_paths(updates);
        field_mask = new field_mask_pb2.FieldMask();
        for (const path in updates) field_mask.getPathsList().push(path);
        for (const [path, value] of Object.entries(updates)) _apply_update(tuned_model, path, value);
    } else if (tuned_model instanceof TunedModel) {
        if (updates !== null) throw new Error("When calling `update_tuned_model(tuned_model:glm.TunedModel, updates=None)`, updates must not be set.");
        name = tuned_model.name;
        const was = client.get_tuned_model({ name });
        field_mask = protobuf_helpers.field_mask(was._pb, tuned_model._pb);
    } else throw new TypeError(`For \`update_tuned_model(tuned_model:dict|glm.TunedModel)\`, tuned_model must be a \`dict\` or a \`glm.TunedModel\`. Got a: ${typeof tuned_model}`);

    const result = client.update_tuned_model(new UpdateTunedModelRequest({ tuned_model: tuned_model.toObject(), update_mask: field_mask }));
    return decode_tuned_model(result.toObject());
}

function _apply_update(thing, path, value) {
    const parts = path.split(".");
    for (const part of parts.slice(0, -1)) thing = thing[part];
    thing[parts[parts.length - 1]] = value;
}

function delete_tuned_model(tuned_model, { client } = {}) {
    if (!client) client = get_default_model_client();
    const name = make_model_name(tuned_model);
    client.delete_tuned_model({ name });
}

function decode_tuned_model(tuned_model) {
    // Add decoding logic if needed
    return TunedModel.fromObject(tuned_model);
}