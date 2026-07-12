(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof $done === 'function' && typeof $request !== 'undefined') {
    $done(api.buildDonePayload($request.headers));
    return;
  }

  root.QQMusicRequestCleaner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildDonePayload(rawHeaders) {
    if (!rawHeaders || typeof rawHeaders !== 'object') {
      return {};
    }

    const headers = { ...rawHeaders };
    const mEncodingKey = findHeaderKey(headers, 'm-encoding');
    if (!mEncodingKey || String(headers[mEncodingKey]).toLowerCase() !== 'm1') {
      return {};
    }

    delete headers[mEncodingKey];

    const acceptEncodingKey = findHeaderKey(headers, 'accept-encoding');
    if (acceptEncodingKey) {
      headers[acceptEncodingKey] = 'gzip';
    } else {
      headers['Accept-Encoding'] = 'gzip';
    }

    return { headers };
  }

  function findHeaderKey(headers, target) {
    return Object.keys(headers).find((key) => key.toLowerCase() === target);
  }

  return { buildDonePayload };
});
