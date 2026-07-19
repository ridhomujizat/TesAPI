// Run: node src/lib/curl/__tests__/tokenize.test.ts (Node >=22)
import assert from 'node:assert';
import { tokenize } from '../tokenize.ts';

assert.deepEqual(tokenize(`curl -H"a: b" "a"'b' --request=POST`), {
  ok: true,
  argv: ['curl', '-Ha: b', 'ab', '--request', 'POST'],
});
assert.deepEqual(tokenize(String.raw`curl $'https://example.com/\x61\tb'`), {
  ok: true,
  argv: ['curl', 'https://example.com/a\tb'],
});
assert.deepEqual(tokenize(String.raw`curl -H "sec-ch-ua: \"Brand\";v=\"150\"" https://example.com`), {
  ok: true,
  argv: ['curl', '-H', 'sec-ch-ua: "Brand";v="150"', 'https://example.com'],
});
assert.deepEqual(tokenize(`curl 'https://example.com`), { ok: false, error: 'Unclosed quote in cURL command.' });

console.log('tokenize.test.ts: all assertions passed');
