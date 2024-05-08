const projectId = 'YOUR_PROJECT_ID';
const operationString = require('node-fetch')('TestOperation.json');

const compute = require('@google-cloud/compute');

let operation = JSON.parse(operationString);

async function waitForOperation() {
  const operationsClient = new compute.ZoneOperationsClient();

  while (operation.status !== 'DONE') {
    [operation] = await operationsClient.wait({
      operation: operation.name,
      project: projectId,
      zone: operation.zone.split('/').pop(),
    });
  }

  console.log('Operation finished.');
}

module.exports = waitForOperation();