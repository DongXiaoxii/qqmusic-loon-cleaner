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

  const CORE_MODULE = /(?:song|playlist|dissinfo|playurl|lyric|search|login|auth|album|singer|vkey|account|vip)/i;

  const MODULE_CATEGORY_PATTERNS = [
    ['live', /^mlive\./i],
    ['video', /music\.recommend\.RecommendClassifyConfigSrv(?:\.|$)/i],
    ['video', /music\.video|shortvideo|VideoCardGetFeedList/i],
    ['mallActivity', /music\.(?:active|actCenter|assetcardcgi|putaocgi)|mall|activity|welfare|lottery/i],
    ['splash', /splash|开屏/i],
    ['popup', /popupwindow|commonpopup|popupexpand|popup|bubble/i],
    ['banner', /advert|radarad|checkadenable|banner|operation|admanger/i],
    ['promoRecommend', /music\.recommend|feed/i],
    ['telemetry', /PushReport|DeviceTokenReport|NoticeOaid|Tracking|Exposure|ReportSvr/i]
  ];

  const CATEGORY_ORDER = [
    'live',
    'video',
    'mallActivity',
    'splash',
    'popup',
    'banner',
    'promoRecommend',
    'telemetry'
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

  function categoryForIdentifier(identifier) {
    for (const [category, pattern] of MODULE_CATEGORY_PATTERNS) {
      if (pattern.test(identifier)) {
        return category;
      }
    }
    return null;
  }

  function categoriesForUrl(url) {
    const text = String(url);
    const categories = [];
    const rules = [
      ['live', /\/(?:mlive|live)(?:[/?._-]|$)/i],
      ['video', /\/(?:shortvideo|video)(?:[/?._-]|$)/i],
      ['mallActivity', /\/(?:mall|activity|welfare|lottery)(?:[/?._-]|$)/i],
      ['splash', /\/(?:splash)(?:[/?._-]|$)/i],
      ['popup', /\/(?:popup|bubble)(?:[/?._-]|$)/i],
      ['banner', /\/(?:advert|ad|banner|operation)(?:[/?._-]|$)/i],
      ['promoRecommend', /\/(?:recommend|feed)(?:[/?._-]|$)/i],
      ['telemetry', /\/(?:report|tracking|exposure)(?:[/?._-]|$)/i]
    ];
    for (const [category, pattern] of rules) {
      if (pattern.test(text)) categories.push(category);
    }
    return categories;
  }

  function uniqueCategories(categories) {
    const categorySet = new Set(categories);
    return CATEGORY_ORDER.filter((category) => categorySet.has(category));
  }

  function extractModuleIdentifiers(text) {
    return [...new Set(
      [...String(text).matchAll(/(?:music|mlive)\.[A-Za-z0-9_.]+/g)]
        .map((match) => match[0].replace(/\d+$/, ''))
    )];
  }

  function decideRequest(request, rawArgument) {
    const safeRequest = request && typeof request === 'object' ? request : {};
    const bodyText = bodyToSearchText(safeRequest.body);
    const identifiers = extractModuleIdentifiers(bodyText);
    const moduleCategories = identifiers
      .map(categoryForIdentifier)
      .filter(Boolean);
    const categories = uniqueCategories(
      moduleCategories.concat(categoriesForUrl(safeRequest.url || ''))
    );

    const options = resolveOptions(rawArgument);
    const hasDisabledCategory = categories.some((category) => {
      return options[CATEGORY_OPTION[category]] === false;
    });
    if (hasDisabledCategory) {
      return { block: false, categories };
    }

    if (identifiers.some((identifier) => CORE_MODULE.test(identifier))) {
      return { block: false, categories };
    }

    const hasUnknownIdentifier = identifiers.some((identifier) => {
      if (categoryForIdentifier(identifier) || CORE_MODULE.test(identifier)) {
        return false;
      }
      return !identifiers.some((candidate) => {
        return candidate !== identifier &&
          (categoryForIdentifier(candidate) || CORE_MODULE.test(candidate)) &&
          candidate.startsWith(`${identifier}.`);
      });
    });
    if (hasUnknownIdentifier || categories.length === 0) {
      return { block: false, categories };
    }

    return { block: true, categories };
  }

  return {
    bodyToSearchText,
    decideRequest,
    resolveOptions
  };
});
