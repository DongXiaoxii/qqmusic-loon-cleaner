# QQ Music Configurable Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight default-on Loon switches that independently control QQ Music advertising, unwanted entries, promotional recommendations, and telemetry without modifying QQ Music compression headers or breaking core music requests.

**Architecture:** Keep `scripts/qqmusic_request.js` as a self-contained request safety controller and `scripts/qqmusic_cleaner.js` as a self-contained JSON response cleaner. Both receive the same Loon `$argument` values, normalize missing values to the default-on policy, and use matching category names. The request controller blocks only fully classified, non-core requests; the response cleaner removes only nodes whose category is enabled.

**Tech Stack:** Loon plugin manifest, ES2020-compatible JavaScript, Node.js built-in test runner (`node:test`), no external packages.

---

## File map

- Modify `scripts/qqmusic_request.js`: remove the failed `m-encoding` rewrite and implement conservative request classification/blocking.
- Modify `scripts/qqmusic_cleaner.js`: add option normalization and category-aware response cleaning.
- Modify `QQMusic.AggressiveCleaner.plugin`: declare eight switches, remove unconditional reject rules, and pass arguments to request/response scripts.
- Modify `tests/qqmusic_request.test.js`: cover request blocking, mixed-request protection, option independence, and no header rewriting.
- Modify `tests/qqmusic_cleaner.test.js`: cover response categories, switch independence, default-on behavior, and core music preservation.
- Modify `tests/manifest.test.js`: validate Loon `[Argument]`, default values, script arguments, and removal of the failed header negotiation description.
- Modify `README.md`: document the configurable behavior and validation workflow.

### Task 1: Replace response-wide heuristics with category-aware options

**Files:**
- Modify: `tests/qqmusic_cleaner.test.js`
- Modify: `scripts/qqmusic_cleaner.js`

- [ ] **Step 1: Write failing tests for option normalization and independent categories**

Append tests that exercise the public API rather than internal constants:

```js
test('missing arguments keep every blocking category enabled', () => {
  assert.deepEqual(cleaner.resolveOptions(), {
    blockSplash: true,
    blockPopup: true,
    blockBanner: true,
    blockLive: true,
    blockVideo: true,
    blockMallActivity: true,
    blockPromoRecommend: true,
    blockTelemetry: true
  });
});

test('a disabled live switch preserves live nodes while other categories are removed', () => {
  const input = JSON.stringify({
    data: {
      cards: [
        { type: 'live', title: '直播' },
        { type: 'popup', title: '活动弹窗' }
      ]
    }
  });
  const output = JSON.parse(cleaner.cleanResponseBody(input, { block_live: false }));
  assert.deepEqual(output.data.cards, [{ type: 'live', title: '直播' }]);
});

test('promotional recommendation blocking preserves ordinary song recommendations', () => {
  const input = JSON.stringify({
    recommend: [
      { song_id: 1, title: '普通歌曲', singer: '歌手' },
      { type: 'operation', title: '福利活动推荐' }
    ]
  });
  const output = JSON.parse(cleaner.cleanResponseBody(input));
  assert.deepEqual(output.recommend, [
    { song_id: 1, title: '普通歌曲', singer: '歌手' }
  ]);
});
```

- [ ] **Step 2: Run the response tests and verify RED**

Run: `node --test tests/qqmusic_cleaner.test.js`

Expected: FAIL because `resolveOptions` does not exist and `cleanResponseBody` does not accept category arguments.

- [ ] **Step 3: Implement option normalization**

Add a default map and parser near the top of `scripts/qqmusic_cleaner.js`:

```js
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

function resolveOptions(rawArgument) {
  const options = {};
  for (const property of Object.values(OPTION_KEYS)) options[property] = true;
  if (!rawArgument || typeof rawArgument !== 'object') return options;
  for (const [argumentKey, property] of Object.entries(OPTION_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(rawArgument, argumentKey)) {
      const value = rawArgument[argumentKey];
      options[property] = value === true || String(value).toLowerCase() === 'true';
    }
  }
  return options;
}
```

Pass `$argument` into `buildDonePayload`, then pass normalized options through `cleanResponseBody`, `cleanNode`, `shouldDropField`, `shouldDropNode`, and `isPromoLikeValue`. Export `resolveOptions` for Node tests.

- [ ] **Step 4: Implement ordered category detection**

Define stable categories and their option properties:

```js
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
```

Implement `detectCategory(text)` using this exact precedence and signals:

```js
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
```

Before dropping any field or node, call `detectCategory` on its key and collected string signature. Drop only when the detected category's option is `true`. Keep the existing `isCoreMusicObject` check before category detection, and keep `recommend`/`feed` only when their contents do not carry a second promotional signal.

- [ ] **Step 5: Run the response tests and verify GREEN**

Run: `node --test tests/qqmusic_cleaner.test.js`

Expected: all response-cleaner tests PASS, including the existing unchanged-binary payload test.

- [ ] **Step 6: Commit the response cleaner slice**

```bash
git add scripts/qqmusic_cleaner.js tests/qqmusic_cleaner.test.js
git commit -m "Add configurable QQ Music response categories"
```

### Task 2: Turn the request script into a conservative blocker

**Files:**
- Modify: `tests/qqmusic_request.test.js`
- Modify: `scripts/qqmusic_request.js`

- [ ] **Step 1: Replace the header-negotiation test with failing request-decision tests**

Use ASCII strings as sanitized stand-ins for binary request bodies:

```js
test('blocks an isolated live module when live blocking is enabled', () => {
  const body = Uint8Array.from(Buffer.from(
    'mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab121'
  ));
  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body
  }), { block: true, categories: ['live'] });
});

test('preserves the same live request when its switch is disabled', () => {
  const body = 'mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab121';
  assert.deepEqual(requestCleaner.decideRequest(
    { url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body },
    { block_live: false }
  ), { block: false, categories: ['live'] });
});

test('never blocks a mixed video advertisement and playlist request', () => {
  const body = [
    'music.advert.SdkAdvert.ProcessRequest181',
    'music.video.TencentVideoQuery.GetVideoListByPlaylistId182',
    'music.srfDissInfo.PlSongExtServer.getPlSongExtInfo185'
  ].join(' ');
  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body
  }), { block: false, categories: ['video', 'banner'] });
});

test('preserves a request that mixes a live module with an unknown module', () => {
  const body = [
    'mlive.recommend.MliveRecommendPushSvr.GetRecommendAnchor',
    'music.unknown.CoreLikeServer.FetchState'
  ].join(' ');
  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body
  }), { block: false, categories: ['live'] });
});

test('does not return modified headers', () => {
  const decision = requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    headers: { 'm-encoding': 'm1', 'accept-encoding': 'nozip' },
    body: 'music.search.SearchCgi.Search'
  });
  assert.equal(Object.hasOwn(decision, 'headers'), false);
});
```

- [ ] **Step 2: Run the request tests and verify RED**

Run: `node --test tests/qqmusic_request.test.js`

Expected: FAIL because `decideRequest` is missing and the old implementation returns modified headers.

- [ ] **Step 3: Implement binary-safe text extraction and option parsing**

Replace the header-copying implementation with:

```js
function bodyToSearchText(body) {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array || ArrayBuffer.isView(body)) {
    let text = '';
    for (let index = 0; index < body.length; index += 1) {
      const byte = body[index];
      text += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ';
    }
    return text;
  }
  return '';
}
```

Copy the same `OPTION_KEYS` and `resolveOptions` behavior used by the response script because Loon downloads each script independently and cannot import a local shared module.

- [ ] **Step 4: Implement conservative request classification**

Use these core and category signals:

```js
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

function extractModuleIdentifiers(text) {
  return [...String(text).matchAll(/(?:music|mlive)\.[A-Za-z0-9_.]+/g)]
    .map((match) => match[0]);
}
```

`decideRequest(request, rawArgument)` must:

1. Combine `request.url` and `bodyToSearchText(request.body)` for category detection.
2. Return `{ block: false, categories }` when `CORE_REQUEST` matches the body.
3. Extract module identifiers and return `block: false` when any identifier matches neither a category nor a core signal.
4. Return `{ block: false, categories: [] }` when no category is identified.
5. Return `block: false` when any identified category has a disabled switch.
6. Return `block: true` only when every identified module is classified into an enabled category and the request has no core signal. A dedicated URL with an explicit category token may be blocked even when it has no body identifiers.

The Loon entrypoint must call `$done()` with no arguments for `block: true`, otherwise `$done({})`. It must never return headers or a replacement body.

- [ ] **Step 5: Run request tests and verify GREEN**

Run: `node --test tests/qqmusic_request.test.js`

Expected: all request-controller tests PASS.

- [ ] **Step 6: Commit the request controller slice**

```bash
git add scripts/qqmusic_request.js tests/qqmusic_request.test.js
git commit -m "Add configurable QQ Music request blocking"
```

### Task 3: Add Loon switches and wire script arguments

**Files:**
- Modify: `tests/manifest.test.js`
- Modify: `QQMusic.AggressiveCleaner.plugin`

- [ ] **Step 1: Write failing manifest tests**

Add a table-driven assertion for all eight arguments:

```js
const switches = [
  'block_splash', 'block_popup', 'block_banner', 'block_live',
  'block_video', 'block_mall_activity', 'block_promo_recommend',
  'block_telemetry'
];
for (const name of switches) {
  assert.match(plugin, new RegExp(`^${name} = switch,true,`, 'm'));
}
assert.doesNotMatch(plugin, /m1 压缩降级|QQ音乐响应协商-u6/);
assert.doesNotMatch(plugin, /^\^https?.* reject$/m);
assert.match(plugin, /http-request .*requires-body=true,binary-body-mode=true.*argument=\[/);
```

Also assert every `http-request` and `http-response` line includes all eight `{argument_name}` placeholders.

- [ ] **Step 2: Run manifest tests and verify RED**

Run: `node --test tests/manifest.test.js`

Expected: FAIL because `[Argument]` is absent, unconditional rejects remain, and the request rule still describes header negotiation.

- [ ] **Step 3: Add plugin metadata and arguments**

Add:

```ini
#!system=iOS,iPadOS,macOS
#!system_version=15
#!loon_version=3.2.1(733)

[Argument]
block_splash = switch,true,tag=[广告] 屏蔽开屏广告,desc=屏蔽开屏素材、启动广告与开屏策略
block_popup = switch,true,tag=[广告] 屏蔽弹窗与气泡,desc=屏蔽弹窗、浮层与标签气泡
block_banner = switch,true,tag=[广告] 屏蔽横幅与运营卡片,desc=屏蔽横幅、运营卡片与推广入口
block_live = switch,true,tag=[入口] 屏蔽直播,desc=屏蔽直播入口、标签与推荐
block_video = switch,true,tag=[入口] 屏蔽视频与短视频,desc=屏蔽视频和短视频入口及推广内容
block_mall_activity = switch,true,tag=[入口] 屏蔽商城、活动与福利,desc=屏蔽商城、活动、福利、抽奖与装扮入口
block_promo_recommend = switch,true,tag=[推荐] 屏蔽推广推荐内容,desc=保留普通歌曲推荐，仅清理带推广信号的推荐位
block_telemetry = switch,true,tag=[隐私] 屏蔽埋点与上报,desc=屏蔽曝光、追踪、报告与广告归因
```

- [ ] **Step 4: Replace static rejects and wire both scripts**

Remove `[Url Rewrite]` and its unconditional reject lines. Configure the request controller with body access:

```ini
http-request ^https?://(?:[A-Za-z0-9-]+\.)?(?:y\.qq\.com|music\.qq\.com|musicpay\.qq\.com)/.* script-path=https://raw.githubusercontent.com/DongXiaoxii/qqmusic-loon-cleaner/main/scripts/qqmusic_request.js,requires-body=true,binary-body-mode=true,tag=QQ音乐可配置请求清理,argument=[{block_splash},{block_popup},{block_banner},{block_live},{block_video},{block_mall_activity},{block_promo_recommend},{block_telemetry}]
```

Keep the existing response host coverage, adding the same complete `argument=[...]` list to every response line. Do not add any `m-encoding` or `accept-encoding` rewrite.

- [ ] **Step 5: Run manifest and full tests**

Run: `node --test`

Expected: all manifest, request, and response tests PASS with zero failures.

- [ ] **Step 6: Commit the manifest slice**

```bash
git add QQMusic.AggressiveCleaner.plugin tests/manifest.test.js
git commit -m "Expose QQ Music blocking switches in Loon"
```

### Task 4: Document usage and perform final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with the eight switches**

Document that every switch defaults on, can be changed independently in the Loon plugin detail page, and that the user should refresh the plugin and restart QQ Music after installing a new plugin version. State that the request controller never modifies QQ Music compression headers and that mixed/core requests are deliberately allowed.

- [ ] **Step 2: Verify sensitive capture files are not tracked**

Run:

```bash
git ls-files '*.zip' '*.har' '.DS_Store'
```

Expected: no output.

- [ ] **Step 3: Run fresh final verification**

Run:

```bash
node --test
node --check scripts/qqmusic_request.js
node --check scripts/qqmusic_cleaner.js
git diff --check
```

Expected: all tests PASS, both syntax checks exit 0, and `git diff --check` has no output.

- [ ] **Step 4: Review the final diff scope**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: only source, tests, manifest, README, design, and plan files are committed; `1298_1783851405201.zip`, `.DS_Store`, and `HANDOFF.md` remain untracked.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/superpowers/plans/2026-07-12-configurable-blocking.md
git commit -m "Document configurable QQ Music cleaning"
```

- [ ] **Step 6: Push the completed implementation**

```bash
git push origin main
```

Expected: `main` advances on `origin` without adding capture artifacts.
