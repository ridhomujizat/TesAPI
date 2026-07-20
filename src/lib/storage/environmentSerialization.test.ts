// Run: node src/lib/storage/environmentSerialization.test.ts (Node >=22)
import assert from 'node:assert';
import type { EnvironmentsFile } from '../../types/index.ts';
import { mergeEnvironmentFiles, serializeLocalEnvironments, serializeSharedEnvironments } from './environmentSerialization.ts';

const file: EnvironmentsFile = {
  schemaVersion: 2,
  activeEnvironmentId: 'env',
  environments: [{
    id: 'env',
    name: 'Staging',
    variables: [
      { id: 'token', key: 'token', value: 'secret-value', enabled: true, secret: true },
      { id: 'url', key: 'base_url', value: 'https://example.com', enabled: true, secret: false },
    ],
  }],
};

const shared = serializeSharedEnvironments(file);
const local = serializeLocalEnvironments(file);
assert.equal('activeEnvironmentId' in shared, false);
assert.equal('value' in shared.environments[0].variables[0], false);
assert.equal(shared.environments[0].variables[1].value, 'https://example.com');
assert.equal(local.values['env/token'], 'secret-value');
assert.equal(local.activeEnvironmentId, 'env');
assert.deepEqual(mergeEnvironmentFiles(shared, local), file);

console.log('environmentSerialization.test.ts: all assertions passed');
