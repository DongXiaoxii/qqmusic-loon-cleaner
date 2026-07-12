# QQ Music Bottom Live and Swipe Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing live and video switches directly block the capture-confirmed bottom live and swipe-song modules while allowing them immediately when their switch is off.

**Architecture:** Refactor only the request controller so classification operates on extracted `music.*` and `mlive.*` identifiers rather than the shared binary envelope. Give exact live and swipe/video modules priority, apply core and unknown-module protection after switch evaluation, and keep generic `musics.fcg` unclassified. Rename the existing video switch label without changing its stored parameter name.

**Tech Stack:** Loon plugin manifest, ES2020-compatible JavaScript, Node.js `node:test`, no dependencies.

---

## File map

- Modify `scripts/qqmusic_request.js`: module-only classification and switch-first live/video decisions.
- Modify `tests/qqmusic_request.test.js`: sanitized native-envelope regression cases from the latest capture.
- Modify `QQMusic.AggressiveCleaner.plugin`: rename the existing video switch label.
- Modify `tests/manifest.test.js`: lock the new label and unchanged `block_video` parameter.
- Modify `README.md`: describe direct bottom live/swipe blocking.
- Add this plan to Git; never add ZIP/HAR captures.

### Task 1: Reproduce native-envelope misclassification

**Files:**
- Modify: `tests/qqmusic_request.test.js`

- [ ] **Step 1: Add a native-envelope test helper and failing live/swipe tests**

Append:

```js
function nativeEnvelope(moduleName) {
  return Uint8Array.from(Buffer.from(
    `authst trace common ${moduleName}`
  ));
}

test('blocks the captured bottom live module despite common auth and trace fields', () => {
  const body = nativeEnvelope(
    'mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab136 ' +
    'mlive.recommend.MliveRecommendCentralPageSvr'
  );
  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body
  }), { block: true, categories: ['live'] });
});

test('allows the captured bottom live module when live blocking is off', () => {
  const body = nativeEnvelope(
    'mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab136 ' +
    'mlive.recommend.MliveRecommendCentralPageSvr'
  );
  assert.deepEqual(requestCleaner.decideRequest(
    { url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body },
    { block_live: false }
  ), { block: false, categories: ['live'] });
});

test('blocks the captured swipe-song config despite common auth and trace fields', () => {
  const body = nativeEnvelope(
    'music.recommend.RecommendClassifyConfigSrv.GetClassifyConfig25 ' +
    'music.recommend.RecommendClassifyConfigSrv'
  );
  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body
  }), { block: true, categories: ['video'] });
});

test('allows the captured swipe-song config when video blocking is off', () => {
  const body = nativeEnvelope(
    'music.recommend.RecommendClassifyConfigSrv.GetClassifyConfig25 ' +
    'music.recommend.RecommendClassifyConfigSrv'
  );
  assert.deepEqual(requestCleaner.decideRequest(
    { url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body },
    { block_video: false }
  ), { block: false, categories: ['video'] });
});
```

- [ ] **Step 2: Add failing precision and safety tests**

```js
test('does not treat ordinary music recommendations as swipe-song video', () => {
  const body = nativeEnvelope('music.recommend.PersonalSongSvr.GetSongs');
  const decision = requestCleaner.decideRequest(
    { url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body },
    { block_video: true, block_promo_recommend: false }
  );
  assert.equal(decision.block, false);
  assert.equal(decision.categories.includes('video'), false);
});

test('does not classify a common trace field as telemetry', () => {
  const decision = requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body: nativeEnvelope('music.commonService.CommonConfSvr.Get')
  });
  assert.equal(decision.categories.includes('telemetry'), false);
});

test('still protects a request mixing bottom video and song modules', () => {
  const body = nativeEnvelope([
    'music.video.VideoCardGetFeedList',
    'music.musichallSong.SongInfoServer.GetSongInfo'
  ].join(' '));
  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg', body
  }), { block: false, categories: ['video'] });
});
```

- [ ] **Step 3: Run request tests and verify RED**

Run: `node --test tests/qqmusic_request.test.js`

Expected: live and swipe tests FAIL because the shared `authst` field triggers `CORE_REQUEST`; trace precision also FAILS because shared `trace` adds telemetry.

### Task 2: Implement module-only live and swipe decisions

**Files:**
- Modify: `scripts/qqmusic_request.js`

- [ ] **Step 1: Replace broad request patterns with identifier rules**

Use exact ordered rules:

```js
const MODULE_CATEGORY_PATTERNS = [
  ['live', /^mlive\./i],
  ['video', /music\.recommend\.RecommendClassifyConfigSrv\.GetClassifyConfig/i],
  ['video', /music\.video|ShortVideo|VideoCardGetFeedList/i],
  ['mallActivity', /music\.(?:active|actCenter|assetcardcgi|putaocgi)|mall|activity|welfare|lottery/i],
  ['splash', /splash/i],
  ['popup', /popupwindow|commonpopup|popupexpand|popup|bubble/i],
  ['banner', /advert|radarad|checkadenable|banner|operation|admanger/i],
  ['promoRecommend', /music\.recommend|feed/i],
  ['telemetry', /PushReport|DeviceTokenReport|NoticeOaid|Tracking|Exposure|ReportSvr/i]
];

const CORE_MODULE = /(?:song|playlist|dissinfo|playurl|lyric|search|login|auth|album|singer|vkey|account|vip)/i;
```

Delete request-side matching of generic `trace` and `report` text. Keep URL-only categorization in a separate `categoriesForUrl(url)` function whose rules require explicit path words; the generic `musics.fcg` URL returns no category.

- [ ] **Step 2: Normalize extracted identifiers**

Change `extractModuleIdentifiers` so it removes numeric call suffixes and deduplicates:

```js
function extractModuleIdentifiers(text) {
  return [...new Set(
    [...String(text).matchAll(/(?:music|mlive)\.[A-Za-z0-9_.]+/g)]
      .map((match) => match[0].replace(/\d+$/, ''))
  )];
}
```

Add `categoryForIdentifier(identifier)` that returns the first matching category from `MODULE_CATEGORY_PATTERNS`.

- [ ] **Step 3: Implement prefix-aware unknown detection and switch-first behavior**

Inside `decideRequest`:

```js
const identifiers = extractModuleIdentifiers(bodyText);
const moduleCategories = identifiers.map(categoryForIdentifier).filter(Boolean);
const urlCategories = categoriesForUrl(safeRequest.url || '');
const categories = uniqueCategories(moduleCategories.concat(urlCategories));

const options = resolveOptions(rawArgument);
if (categories.some((category) => options[CATEGORY_OPTION[category]] === false)) {
  return { block: false, categories };
}

const coreIdentifiers = identifiers.filter((identifier) => CORE_MODULE.test(identifier));
if (coreIdentifiers.length > 0) return { block: false, categories };

const unknownIdentifiers = identifiers.filter((identifier) => {
  if (categoryForIdentifier(identifier) || CORE_MODULE.test(identifier)) return false;
  return !identifiers.some((candidate) => {
    return candidate !== identifier &&
      (categoryForIdentifier(candidate) || CORE_MODULE.test(candidate)) &&
      candidate.startsWith(`${identifier}.`);
  });
});
if (unknownIdentifiers.length > 0 || categories.length === 0) {
  return { block: false, categories };
}
return { block: true, categories };
```

`uniqueCategories` must preserve the rule order so live/video expectations remain stable.

- [ ] **Step 4: Run request tests and verify GREEN**

Run: `node --test tests/qqmusic_request.test.js`

Expected: all request tests PASS, including existing mixed/unknown/header-safety tests.

- [ ] **Step 5: Run the complete suite**

Run: `node --test`

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Commit request classification**

```bash
git add scripts/qqmusic_request.js tests/qqmusic_request.test.js
git commit -m "Block bottom live and swipe modules precisely"
```

### Task 3: Rename the video switch and document behavior

**Files:**
- Modify: `tests/manifest.test.js`
- Modify: `QQMusic.AggressiveCleaner.plugin`
- Modify: `README.md`
- Add: `docs/superpowers/plans/2026-07-12-bottom-live-swipe-blocking.md`

- [ ] **Step 1: Write a failing manifest label test**

```js
test('video switch explicitly includes bottom swipe-song blocking', async () => {
  const pluginPath = path.join(__dirname, '..', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');
  assert.match(
    plugin,
    /^block_video = switch,true,tag=\[入口\] 屏蔽刷歌、视频与短视频,/m
  );
});
```

- [ ] **Step 2: Run manifest tests and verify RED**

Run: `node --test tests/manifest.test.js`

Expected: FAIL because the current label is `[入口] 屏蔽视频与短视频`.

- [ ] **Step 3: Rename the label without changing the parameter**

Change only the `block_video` argument line to:

```ini
block_video = switch,true,tag=[入口] 屏蔽刷歌、视频与短视频,desc=屏蔽底部刷歌入口、视频和短视频 Feed
```

Update README to state that `block_live` and `block_video` directly interrupt the capture-confirmed bottom entry configuration modules when on and allow them when off.

- [ ] **Step 4: Run fresh final verification**

Run:

```bash
node --test
node --check scripts/qqmusic_request.js
node --check scripts/qqmusic_cleaner.js
git diff --check
test -z "$(git ls-files '*.zip' '*.har' '.DS_Store')"
```

Expected: all tests PASS, syntax checks exit 0, diff check has no output, and captures remain untracked.

- [ ] **Step 5: Commit documentation and manifest**

```bash
git add QQMusic.AggressiveCleaner.plugin tests/manifest.test.js README.md docs/superpowers/plans/2026-07-12-bottom-live-swipe-blocking.md
git commit -m "Document bottom swipe blocking switch"
```

- [ ] **Step 6: Push main**

```bash
git push origin main
```

Expected: origin/main advances without adding `1300_1783852730243.zip`, `.DS_Store`, or `HANDOFF.md`.
