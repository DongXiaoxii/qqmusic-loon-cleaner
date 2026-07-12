const test = require('node:test');
const assert = require('node:assert/strict');

const requestCleaner = require('../scripts/qqmusic_request.js');

test('replaces QQ Music m1 response negotiation with standard gzip', () => {
  const payload = requestCleaner.buildDonePayload({
    'm-encoding': 'm1',
    'accept-encoding': 'nozip',
    Cookie: 'preserved'
  });

  assert.deepEqual(payload, {
    headers: {
      'accept-encoding': 'gzip',
      Cookie: 'preserved'
    }
  });
});
