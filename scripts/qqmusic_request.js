(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof $done === 'function' && typeof $request !== 'undefined') {
    try {
      const decision = api.decideRequest(
        $request,
        typeof $argument !== 'undefined' ? $argument : undefined
      );
      if (decision.block) {
        $done();
      } else {
        $done({});
      }
    } catch (error) {
      $done({});
    }
    return;
  }

  root.QQMusicRequestCleaner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  const CORE_REQUEST = /(?:song|playlist|dissinfo|playurl|lyric|search|login|auth|album|singer|user\.info|vip)/i;

  const CATEGORY_PATTERNS = [
    ['live', /mlive|\blive\b|直播/i],
    ['video', /shortvideo|music\.video|短视频|视频/i],
    ['mallActivity', /mall|activity|welfare|lottery|music\.active|商城|活动|福利/i],
    ['splash', /splash|开屏/i],
    ['popup', /popupwindow|querytabbubble|popup|bubble|弹窗|气泡/i],
    ['banner', /advert|radarad|checkadenable|banner|operation|广告/i],
    ['promoRecommend', /music\.recommend|recommendclassify|feed/i],
    ['telemetry', /report|trace|tracking|exposure|归因|上报/i]
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

  function bodyToSearchText(body) {
    if (typeof body === 'string') {
      return body;
    }

    const isView = typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body);
    if (!(body instanceof Uint8Array) && !isView) {
      return '';
    }

    let text = '';
    for (let index = 0; index < body.length; index += 1) {
      const byte = body[index];
      text += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ';
    }
    return text;
  }

  function categoriesFor(text) {
    const categories = [];
    for (const [category, pattern] of CATEGORY_PATTERNS) {
      if (pattern.test(text)) {
        categories.push(category);
      }
    }
    return categories;
  }

  function extractModuleIdentifiers(text) {
    return [...String(text).matchAll(/(?:music|mlive)\.[A-Za-z0-9_.]+/g)]
      .map((match) => match[0]);
  }

  function decideRequest(request, rawArgument) {
    const safeRequest = request && typeof request === 'object' ? request : {};
    const bodyText = bodyToSearchText(safeRequest.body);
    const searchText = `${safeRequest.url || ''} ${bodyText}`;
    const categories = categoriesFor(searchText);

    if (CORE_REQUEST.test(bodyText)) {
      return { block: false, categories };
    }

    const identifiers = extractModuleIdentifiers(bodyText);
    const hasUnknownIdentifier = identifiers.some((identifier) => {
      return !CORE_REQUEST.test(identifier) && categoriesFor(identifier).length === 0;
    });
    if (hasUnknownIdentifier || categories.length === 0) {
      return { block: false, categories };
    }

    const options = resolveOptions(rawArgument);
    const everyCategoryEnabled = categories.every((category) => {
      return options[CATEGORY_OPTION[category]] === true;
    });

    return { block: everyCategoryEnabled, categories };
  }

  return {
    bodyToSearchText,
    decideRequest,
    resolveOptions
  };
});
