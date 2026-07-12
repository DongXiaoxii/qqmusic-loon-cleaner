const test = require('node:test');
const assert = require('node:assert/strict');

const requestCleaner = require('../scripts/qqmusic_request.js');

test('blocks an isolated live module when live blocking is enabled', () => {
  const body = Uint8Array.from(Buffer.from(
    'mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab121'
  ));

  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body
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
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body
  }), { block: false, categories: ['video', 'banner'] });
});

test('preserves a request that mixes a live module with an unknown module', () => {
  const body = [
    'mlive.recommend.MliveRecommendPushSvr.GetRecommendAnchor',
    'music.unknown.CoreLikeServer.FetchState'
  ].join(' ');

  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body
  }), { block: false, categories: ['live'] });
});

test('does not return modified compression headers', () => {
  const decision = requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    headers: {
      'm-encoding': 'm1',
      'accept-encoding': 'nozip'
    },
    body: 'music.search.SearchCgi.Search'
  });

  assert.equal(Object.hasOwn(decision, 'headers'), false);
  assert.equal(decision.block, false);
});
