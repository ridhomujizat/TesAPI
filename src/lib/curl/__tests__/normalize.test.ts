// Run: node src/lib/curl/__tests__/normalize.test.ts (Node >=22)
import assert from 'node:assert';
import { detectDialect, normalize } from '../normalize.ts';
import { chromeBash, chromeCmd, chromePowerShell } from './fixtures.ts';

assert.equal(detectDialect(chromeCmd), 'cmd');
assert.equal(detectDialect(chromePowerShell), 'powershell');
assert.equal(detectDialect(chromeBash), 'bash');
assert.equal(normalize(chromeCmd), normalize(chromeBash));
assert.equal(normalize(chromePowerShell), normalize(chromeBash).replace(/^curl\b/, 'curl.exe'));
assert.equal(
  normalize('curl.exe "x" -H "a: `"b`n"'),
  'curl.exe "x" -H "a: \\"b\n"',
);

console.log('normalize.test.ts: all assertions passed');
