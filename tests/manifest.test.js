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
  assert.match(plugin, /\[Url Rewrite\]/);
});
