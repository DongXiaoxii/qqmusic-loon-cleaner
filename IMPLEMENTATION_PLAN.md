# QQ 音乐 Loon 激进清理插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Loon plugin for iOS QQ 音乐 that aggressively removes ads and unwanted tabs while preserving core playback flows.

**Architecture:** Keep the implementation in two runtime files: a Loon plugin manifest and one reusable JavaScript cleaner script. The script owns all JSON filtering logic and is written so it can run both inside Loon and under Node tests. The plugin file only wires MITM, rewrite, and response-script rules together.

**Tech Stack:** Loon plugin format, vanilla JavaScript, Node.js `node:test`, iPhone mirror verification through Computer Use.

---

### Task 1: Lock the expected cleaning behavior in tests

**Files:**
- Create: `tests/qqmusic_cleaner.test.js`
- Create: `tests/plugin_manifest.test.js`

- [ ] **Step 1: Write the failing cleaner tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanResponseBody } = require('../loon/scripts/qqmusic_cleaner.js');

test('cleanResponseBody removes splash and activity entries but preserves songs', () => {
  const input = JSON.stringify({
    data: {
      cards: [
        { title: '开屏广告', type: 'popup', url: 'https://ads.qq.com/splash' },
        { title: '周杰伦', type: 'song', song_id: 12345, artist: '周杰伦' }
      ]
    }
  });

  const output = cleanResponseBody(input);
  assert.equal(
    output,
    JSON.stringify({
      data: {
        cards: [
          { title: '周杰伦', type: 'song', song_id: 12345, artist: '周杰伦' }
        ]
      }
    })
  );
});

test('cleanResponseBody returns the original body for invalid JSON', () => {
  const input = 'not-json';
  assert.equal(cleanResponseBody(input), input);
});
```

- [ ] **Step 2: Write the failing manifest boundary test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('plugin manifest stays narrow and points at the cleaner script', async () => {
  const pluginPath = path.join(__dirname, '..', 'loon', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');

  assert.match(plugin, /^\s*#!name=.*QQ音乐/m);
  assert.match(plugin, /\[script\][\s\S]*script-path\s*=\s*scripts\/qqmusic_cleaner\.js/i);
  assert.match(plugin, /\[mitm\][\s\S]*hostname\s*=\s*(?:y\.qq\.com|u\.qq\.com|c\.qq\.com|i\.qq\.com|musicpay\.qq\.com|\*\.music\.qq\.com)/i);
  assert.doesNotMatch(plugin, /hostname\s*=\s*\*\.qq\.com/i);
});
```

- [ ] **Step 3: Run the tests to confirm they fail for the right reasons**

Run:

```bash
node --test tests/qqmusic_cleaner.test.js tests/plugin_manifest.test.js
```

Expected: fail because `cleanResponseBody` does not exist yet and `QQMusic.AggressiveCleaner.plugin` has not been created yet.

- [ ] **Step 4: Commit the test harness**

```bash
git add tests/qqmusic_cleaner.test.js tests/plugin_manifest.test.js
git commit -m "test: define QQ Music cleaner expectations"
```

### Task 2: Implement the reusable cleaner script

**Files:**
- Create: `loon/scripts/qqmusic_cleaner.js`

- [ ] **Step 1: Write the cleaner with a Loon entrypoint and Node export**

```js
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

    const cleaned = cleanNode(parsed, []);
    if (cleaned === undefined || cleaned === null) {
      return rawBody;
    }

    try {
      return JSON.stringify(cleaned);
    } catch (error) {
      return rawBody;
    }
  }

  function cleanNode(value, path) {
    return value;
  }

  return { cleanResponseBody };
});
```

- [ ] **Step 2: Implement the minimum JSON walker and keyword filters**

Use a recursive object/array walker that:

```js
const AD_TEXT = ['广告', '开屏', '弹窗', '直播', '商城', '活动', '抽奖', '短视频', '看点', '扑通', '装扮', '福利', '运营'];
const AD_KEYS = ['ad', 'ads', 'advert', 'advertisement', 'splash', 'popup', 'pop', 'banner', 'operation', 'activity', 'h5', 'live', 'mall', 'video', 'shortvideo', 'feed', 'recommend', 'trace', 'report'];
```

Rules:

- Remove array items that clearly look like promotion or unwanted tab entries.
- Keep songs, albums, artists, playlists, lyrics, playback data, account data, and payment/member data.
- If parsing fails, return the original body unchanged.
- If cleaning produces an invalid top-level shape, fall back to the original body.

- [ ] **Step 3: Run the cleaner tests until they pass**

Run:

```bash
node --test tests/qqmusic_cleaner.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit the cleaner implementation**

```bash
git add loon/scripts/qqmusic_cleaner.js tests/qqmusic_cleaner.test.js
git commit -m "feat: add QQ Music response cleaner"
```

### Task 3: Create the Loon plugin manifest

**Files:**
- Create: `loon/QQMusic.AggressiveCleaner.plugin`

- [ ] **Step 1: Write the manifest with metadata, rewrite, script, and MITM blocks**

```ini
#!name=QQ 音乐激进清理
#!desc=针对 iOS QQ 音乐的开屏、运营位、垃圾 tab 和推广入口做激进清理
#!author=Codex
#!type=normal

[rewrite]
^https?:\/\/.*(splash|popup|advert|ad|operation|activity).* reject

[script]
http-response ^https?:\/\/(y|u|c|i)\.qq\.com\/.* script-path=scripts/qqmusic_cleaner.js, requires-body=true, tag=QQ音乐清理
http-response ^https?:\/\/musicpay\.qq\.com\/.* script-path=scripts/qqmusic_cleaner.js, requires-body=true, tag=QQ音乐清理

[mitm]
hostname = y.qq.com, u.qq.com, c.qq.com, i.qq.com, musicpay.qq.com, *.music.qq.com
```

- [ ] **Step 2: Tighten the manifest to the final host list and rewrite scope**

Make the rewrite block explicit enough that a broken rule can be disabled without removing the whole plugin. Keep the MITM list narrow and avoid `*.qq.com`.

- [ ] **Step 3: Run the manifest test and the cleaner test together**

Run:

```bash
node --test tests/qqmusic_cleaner.test.js tests/plugin_manifest.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit the manifest**

```bash
git add loon/QQMusic.AggressiveCleaner.plugin
git commit -m "feat: add QQ Music Loon manifest"
```

### Task 4: Install into Loon and verify on the iPhone mirror

**Files:**
- Modify in-app Loon configuration only; no workspace file changes expected.

- [ ] **Step 1: Open Loon on the mirrored iPhone and import the plugin**

Use Computer Use to:

1. Open Loon.
2. Import `loon/QQMusic.AggressiveCleaner.plugin`.
3. Confirm the plugin is enabled.
4. Confirm MITM is enabled for the QQ 音乐 host list.

- [ ] **Step 2: Verify the certificate and first-run behavior**

Check that the MITM certificate is trusted before testing QQ 音乐. If Loon prompts for any permission or trust action, stop and confirm the exact prompt before proceeding.

- [ ] **Step 3: Smoke test QQ 音乐**

Launch QQ 音乐 and verify:

1. Cold start no longer shows the obvious splash ad if the target endpoint is hit.
2. Home and tab pages lose live, short video, mall, and activity entries when the response script matches.
3. Search, playback, lyrics, playlists, albums, favorites, and login still work.

- [ ] **Step 4: Capture the first round of log-driven adjustments**

If a wanted feature breaks, disable the most likely rewrite rule first, then inspect whether the response script removed too much. If an unwanted entry remains, add a more specific URL or text indicator and rerun the local tests before the next smoke test.

- [ ] **Step 5: Commit any code changes from the smoke test**

```bash
git add loon/QQMusic.AggressiveCleaner.plugin loon/scripts/qqmusic_cleaner.js tests/qqmusic_cleaner.test.js tests/plugin_manifest.test.js
git commit -m "test: verify QQ Music cleaner in Loon"
```
