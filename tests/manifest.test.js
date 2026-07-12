const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('remote plugin uses raw github script path and y.qq.com subdomains', async () => {
  const pluginPath = path.join(__dirname, '..', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');

  assert.match(plugin, /script-path=https:\/\/raw\.githubusercontent\.com\/DongXiaoxii\/qqmusic-loon-cleaner\/main\/scripts\/qqmusic_cleaner\.js/);
  assert.ok(
    plugin.includes('http-response ^https?://(?:[A-Za-z0-9-]+\\.)?(?:u|c|i)\\.y\\.qq\\.com/.* script-path='),
    'script rules should cover u.y.qq.com, c.y.qq.com, and i.y.qq.com'
  );
  assert.match(plugin, /\[Argument\]/);
});

test('plugin decrypts and cleans the observed u6.y.qq.com API host', async () => {
  const pluginPath = path.join(__dirname, '..', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');

  assert.ok(
    plugin.includes('http-response ^https?://u6\\.y\\.qq\\.com/.* script-path='),
    'u6.y.qq.com responses should invoke the cleaner'
  );
  assert.match(
    plugin,
    /hostname = [^\n]*u6\.y\.qq\.com/,
    'u6.y.qq.com should be included in MITM'
  );
});

test('plugin exposes eight default-on blocking switches', async () => {
  const pluginPath = path.join(__dirname, '..', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');

  const switches = [
    'block_splash',
    'block_popup',
    'block_banner',
    'block_live',
    'block_video',
    'block_mall_activity',
    'block_promo_recommend',
    'block_telemetry'
  ];

  for (const name of switches) {
    assert.match(plugin, new RegExp(`^${name} = switch,true,`, 'm'));
  }

  const scriptLines = plugin.split('\n').filter((line) => /^http-(?:request|response) /.test(line));
  assert.ok(scriptLines.length > 0);
  for (const line of scriptLines) {
    for (const name of switches) {
      assert.ok(line.includes(`{${name}}`), `${name} should be passed to every script`);
    }
  }
});

test('plugin uses the request safety controller without static rejects or m1 rewrites', async () => {
  const pluginPath = path.join(__dirname, '..', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');

  assert.doesNotMatch(plugin, /m1 压缩降级|QQ音乐响应协商-u6/);
  assert.doesNotMatch(plugin, /^\^https?.* reject$/m);
  assert.match(
    plugin,
    /http-request .*qqmusic_request\.js,requires-body=true,binary-body-mode=true,.*argument=\[/
  );
});

test('video switch explicitly includes bottom swipe-song blocking', async () => {
  const pluginPath = path.join(__dirname, '..', 'QQMusic.AggressiveCleaner.plugin');
  const plugin = await fs.readFile(pluginPath, 'utf8');

  assert.match(
    plugin,
    /^block_video = switch,true,tag=\[入口\] 屏蔽刷歌、视频与短视频,/m
  );
});
