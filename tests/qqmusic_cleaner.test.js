const test = require('node:test');
const assert = require('node:assert/strict');

const cleaner = require('../scripts/qqmusic_cleaner.js');

test('buildDonePayload leaves an unparseable response untouched', () => {
  assert.equal(
    typeof cleaner.buildDonePayload,
    'function',
    'the Loon response entrypoint should expose its output decision'
  );

  assert.deepEqual(
    cleaner.buildDonePayload('\u0000\u0001not-json\u0002'),
    {},
    'an unchanged binary or non-JSON response must not be written back'
  );
});

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

test('every category switch independently controls its matching response nodes', () => {
  const cases = [
    ['block_splash', 'splash', '开屏'],
    ['block_popup', 'popup', '弹窗'],
    ['block_banner', 'banner', '横幅'],
    ['block_live', 'live', '直播'],
    ['block_video', 'shortvideo', '短视频'],
    ['block_mall_activity', 'activity', '活动'],
    ['block_promo_recommend', 'feed', '推广推荐'],
    ['block_telemetry', 'report', '上报']
  ];
  const song = { song_id: 1, title: '普通歌曲', singer: '歌手' };

  for (const [argumentName, kind, label] of cases) {
    const input = JSON.stringify({ cards: [song, { kind, label }] });
    const blocked = JSON.parse(cleaner.cleanResponseBody(input));
    const allowed = JSON.parse(cleaner.cleanResponseBody(input, {
      [argumentName]: false
    }));

    assert.deepEqual(blocked.cards, [song], `${argumentName} should default to on`);
    assert.deepEqual(
      allowed.cards,
      [song, { kind, label }],
      `${argumentName} should preserve its category when off`
    );
  }
});
