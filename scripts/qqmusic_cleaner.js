(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof $done === 'function' && typeof $response !== 'undefined') {
    const cleaned = api.cleanResponseBody($response.body);
    $done({ body: cleaned });
    return;
  }

  root.QQMusicCleaner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DROP = Symbol('drop');

  const STRONG_PROMO_KEYS = new Set([
    'ad',
    'ads',
    'advert',
    'advertisement',
    'splash',
    'popup',
    'pop',
    'banner',
    'operation',
    'activity',
    'h5',
    'live',
    'mall',
    'video',
    'shortvideo',
    'trace',
    'report'
  ]);

  const WEAK_PROMO_KEYS = new Set(['feed', 'recommend']);

  const CORE_KEYS = new Set([
    'song_id',
    'track_id',
    'mid',
    'media_mid',
    'song_mid',
    'album_mid',
    'singer_mid',
    'playlist_id',
    'dissid',
    'list_id',
    'artist',
    'singer',
    'album',
    'title',
    'name',
    'lyric',
    'duration',
    'play_url',
    'url'
  ]);

  const PROMO_TEXT = [
    '广告',
    '开屏',
    '弹窗',
    '直播',
    '商城',
    '活动',
    '抽奖',
    '短视频',
    '看点',
    '扑通',
    '装扮',
    '福利',
    '运营'
  ];

  const PROMO_URL_HINTS = [
    'advert',
    'advertisement',
    'ad',
    'ads',
    'splash',
    'popup',
    'operation',
    'activity',
    'live',
    'mall',
    'video',
    'shortvideo',
    'report',
    'trace'
  ];

  function cleanResponseBody(rawBody) {
    if (typeof rawBody !== 'string' || rawBody.length === 0) {
      return rawBody;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      return rawBody;
    }

    const cleaned = cleanNode(parsed, [], true);
    if (cleaned === DROP || cleaned === undefined || cleaned === null) {
      return rawBody;
    }

    if (Array.isArray(parsed)) {
      if (!Array.isArray(cleaned)) {
        return rawBody;
      }
    } else if (isPlainObject(parsed)) {
      if (!isPlainObject(cleaned)) {
        return rawBody;
      }
      if (Object.keys(cleaned).length === 0 && Object.keys(parsed).length > 0) {
        return rawBody;
      }
    }

    try {
      return JSON.stringify(cleaned);
    } catch (error) {
      return rawBody;
    }
  }

  function cleanNode(value, path, isRoot) {
    if (value === null || typeof value !== 'object') {
      return cleanPrimitive(value);
    }

    if (Array.isArray(value)) {
      const next = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (shouldDropNode(item, path.concat(String(index)))) {
          continue;
        }
        const cleanedItem = cleanNode(item, path.concat(String(index)), false);
        if (cleanedItem !== DROP && cleanedItem !== undefined) {
          next.push(cleanedItem);
        }
      }

      if (!isRoot && value.length > 0 && next.length === 0) {
        return DROP;
      }

      return next;
    }

    if (!isPlainObject(value)) {
      return value;
    }

    if (!isRoot && shouldDropNode(value, path)) {
      return DROP;
    }

    if (!isRoot && isCoreMusicObject(value)) {
      return value;
    }

    const next = {};
    for (const [key, child] of Object.entries(value)) {
      if (shouldDropField(key, child, path)) {
        continue;
      }

      const cleanedChild = cleanNode(child, path.concat(key), false);
      if (cleanedChild === DROP || cleanedChild === undefined) {
        continue;
      }
      next[key] = cleanedChild;
    }

    if (!isRoot && Object.keys(next).length === 0 && Object.keys(value).length > 0) {
      return DROP;
    }

    return next;
  }

  function cleanPrimitive(value) {
    if (typeof value !== 'string') {
      return value;
    }

    if (isPromoText(value) || isPromoUrl(value)) {
      return DROP;
    }

    return value;
  }

  function shouldDropField(key, value, path) {
    const lowerKey = String(key).toLowerCase();

    if (STRONG_PROMO_KEYS.has(lowerKey)) {
      return true;
    }

    if (WEAK_PROMO_KEYS.has(lowerKey)) {
      return isPromoLikeValue(value, path);
    }

    if (isTrackingKey(lowerKey)) {
      return true;
    }

    if (isPromoUrlKey(lowerKey) && isPromoLikeValue(value, path)) {
      return true;
    }

    return false;
  }

  function shouldDropNode(value, path) {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string') {
      return isPromoText(value) || isPromoUrl(value);
    }

    if (typeof value !== 'object') {
      return false;
    }

    if (Array.isArray(value)) {
      return false;
    }

    if (isCoreMusicObject(value)) {
      return false;
    }

    const signature = collectStringSignature(value);
    if (signature.length === 0) {
      return false;
    }

    if (signature.some(isPromoText) || signature.some(isPromoUrl)) {
      return true;
    }

    return hasPromoKey(value);
  }

  function isPromoLikeValue(value, path) {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string') {
      return isPromoText(value) || isPromoUrl(value);
    }

    if (Array.isArray(value)) {
      return value.some((item, index) => shouldDropNode(item, path.concat(String(index))));
    }

    if (typeof value === 'object') {
      if (isCoreMusicObject(value)) {
        return false;
      }
      return shouldDropNode(value, path);
    }

    return false;
  }

  function hasPromoKey(value) {
    for (const key of Object.keys(value)) {
      const lowerKey = key.toLowerCase();
      if (STRONG_PROMO_KEYS.has(lowerKey)) {
        return true;
      }
    }

    return false;
  }

  function isCoreMusicObject(value) {
    if (!isPlainObject(value)) {
      return false;
    }

    const keys = Object.keys(value).map((key) => key.toLowerCase());
    const keySet = new Set(keys);
    const hasIdentity = ['song_id', 'track_id', 'mid', 'media_mid', 'song_mid', 'album_mid', 'singer_mid', 'playlist_id', 'dissid', 'list_id'].some((key) => keySet.has(key));
    const hasMusicLabel = ['artist', 'singer', 'album', 'lyric', 'duration', 'play_url'].some((key) => keySet.has(key));

    if (!hasIdentity) {
      return false;
    }

    if (keySet.has('song_id') || keySet.has('track_id') || keySet.has('mid') || keySet.has('media_mid')) {
      return true;
    }

    return hasMusicLabel;
  }

  function collectStringSignature(value) {
    const result = [];
    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (typeof child === 'string') {
        result.push(child);
      } else if (typeof child === 'number' || typeof child === 'boolean') {
        result.push(String(child));
      } else if (child && typeof child === 'object' && !Array.isArray(child)) {
        if (CORE_KEYS.has(lowerKey)) {
          continue;
        }
        const nested = collectStringSignature(child);
        result.push(...nested);
      }
    }
    return result;
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function isPromoText(text) {
    if (typeof text !== 'string') {
      return false;
    }

    return PROMO_TEXT.some((token) => text.includes(token));
  }

  function isPromoUrl(text) {
    if (typeof text !== 'string') {
      return false;
    }

    const lower = text.toLowerCase();
    return PROMO_URL_HINTS.some((token) => lower.includes(token));
  }

  function isTrackingKey(key) {
    return key === 'trace' || key === 'report' || key === 'tracking' || key === 'exposure' || key === 'expose';
  }

  function isPromoUrlKey(key) {
    return key === 'url' || key === 'jumpurl' || key === 'jump_url' || key === 'link' || key === 'href' || key === 'weburl' || key === 'targeturl';
  }

  return {
    cleanResponseBody,
    cleanNode,
    isPromoText,
    isPromoUrl
  };
});
