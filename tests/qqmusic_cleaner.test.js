const test = require('node:test');
const assert = require('node:assert/strict');

const cleaner = require('../scripts/qqmusic_cleaner.js');

test('buildDonePayload leaves an unparseable response untouched', () => {
  assert.equal(
    typeof cleaner.buildDonePayload,
    'function',
    'the Loon response entrypoint should expose its output decision'
  );

  assert.deepEqual(
    cleaner.buildDonePayload('\u0000\u0001not-json\u0002'),
    {},
    'an unchanged binary or non-JSON response must not be written back'
  );
});
