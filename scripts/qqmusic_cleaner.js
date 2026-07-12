(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof $done === 'function' && typeof $response !== 'undefined') {
    $done(api.buildDonePayload(
      $response.body,
      typeof $argument !== 'undefined' ? $argument : undefined
    ));
    return;
  }

  root.QQMusicCleaner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DROP = Symbol('drop');

  const OPTION_KEYS = {
    block_splash: 'blockSplash',
    block_popup: 'blockPopup',
    block_banner: 'blockBanner',
    block_live: 'blockLive',
    block_video: 'blockVideo',
    block_mall_activity: 'blockMallActivity',
    block_promo_recommend: 'blockPromoRecommend',
    block_telemetry: 'blockTelemetry'
  };

  const CATEGORY_OPTION = {
    splash: 'blockSplash',
    popup: 'blockPopup',
    banner: 'blockBanner',
    live: 'blockLive',
    video: 'blockVideo',
    mallActivity: 'blockMallActivity',
    promoRecommend: 'blockPromoRecommend',
    telemetry: 'blockTelemetry'
  };

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

  function resolveOptions(rawArgument) {
    const options = {};
    for (const property of Object.values(OPTION_KEYS)) {
      options[property] = true;
    }

    if (!rawArgument || typeof rawArgument !== 'object') {
      return options;
    }

    for (const [argumentKey, property] of Object.entries(OPTION_KEYS)) {
      if (!Object.prototype.hasOwnProperty.call(rawArgument, argumentKey)) {
        continue;
      }
      const value = rawArgument[argumentKey];
      options[property] = value === true || String(value).toLowerCase() === 'true';
    }

    return options;
  }

  function cleanResponseBody(rawBody, rawArgument) {
    if (typeof rawBody !== 'string' || rawBody.length === 0) {
      return rawBody;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      return rawBody;
    }

    const cleaned = cleanNode(parsed, [], true, resolveOptions(rawArgument));
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

  function buildDonePayload(rawBody, rawArgument) {
    const cleaned = cleanResponseBody(rawBody, rawArgument);
    return cleaned === rawBody ? {} : { body: cleaned };
  }

  function cleanNode(value, path, isRoot, options) {
    if (value === null || typeof value !== 'object') {
      return cleanPrimitive(value, options);
    }

    if (Array.isArray(value)) {
      const next = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (shouldDropNode(item, path.concat(String(index)), options)) {
          continue;
        }
        const cleanedItem = cleanNode(item, path.concat(String(index)), false, options);
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

    if (!isRoot && shouldDropNode(value, path, options)) {
      return DROP;
    }

    if (!isRoot && isCoreMusicObject(value)) {
      return value;
    }

    const next = {};
    for (const [key, child] of Object.entries(value)) {
      if (shouldDropField(key, child, path, options)) {
        continue;
      }

      const cleanedChild = cleanNode(child, path.concat(key), false, options);
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

  function cleanPrimitive(value, options) {
    if (typeof value !== 'string') {
      return value;
    }

    const category = detectCategory(value);
    if (category && isCategoryEnabled(category, options)) {
      return DROP;
    }

    return value;
  }

  function shouldDropField(key, value, path, options) {
    const lowerKey = String(key).toLowerCase();

    if (WEAK_PROMO_KEYS.has(lowerKey)) {
      return false;
    }

    const keyCategory = detectCategory(lowerKey);
    if (keyCategory) {
      return isCategoryEnabled(keyCategory, options);
    }

    if (isPromoUrlKey(lowerKey)) {
      return isPromoLikeValue(value, path, options);
    }

    return false;
  }

  function shouldDropNode(value, path, options) {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string') {
      const category = detectCategory(value);
      return Boolean(category && isCategoryEnabled(category, options));
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

    const signature = Object.keys(value).concat(collectStringSignature(value));
    const category = detectFirstCategory(signature);
    return Boolean(category && isCategoryEnabled(category, options));
  }

  function isPromoLikeValue(value, path, options) {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string') {
      const category = detectCategory(value);
      return Boolean(category && isCategoryEnabled(category, options));
    }

    if (Array.isArray(value)) {
      return value.some((item, index) => shouldDropNode(item, path.concat(String(index)), options));
    }

    if (typeof value === 'object') {
      if (isCoreMusicObject(value)) {
        return false;
      }
      return shouldDropNode(value, path, options);
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

  function detectFirstCategory(values) {
    for (const value of values) {
      const category = detectCategory(value);
      if (category) {
        return category;
      }
    }
    return null;
  }

  function detectCategory(text) {
    const value = String(text).toLowerCase();
    if (/mlive|\blive\b|直播/.test(value)) return 'live';
    if (/shortvideo|\bvideo\b|短视频|视频|看点/.test(value)) return 'video';
    if (/\bmall\b|activity|welfare|lottery|商城|活动|福利|抽奖|装扮|扑通/.test(value)) return 'mallActivity';
    if (/splash|开屏/.test(value)) return 'splash';
    if (/popup|bubble|浮层|弹窗|气泡/.test(value)) return 'popup';
    if (/banner|operation|运营|推广入口/.test(value)) return 'banner';
    if (/recommend|feed|推广推荐/.test(value)) return 'promoRecommend';
    if (/trace|report|tracking|exposure|expose|埋点|上报|归因/.test(value)) return 'telemetry';
    if (/\badvert(?:isement)?\b|\bads?\b|广告/.test(value)) return 'banner';
    return null;
  }

  function isCategoryEnabled(category, options) {
    return options[CATEGORY_OPTION[category]] === true;
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
    buildDonePayload,
    cleanResponseBody,
    cleanNode,
    resolveOptions,
    detectCategory,
    isPromoText,
    isPromoUrl
  };
});
