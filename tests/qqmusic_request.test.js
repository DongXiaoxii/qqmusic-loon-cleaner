const test = require('node:test');
const assert = require('node:assert/strict');

const requestCleaner = require('../scripts/qqmusic_request.js');

function nativeEnvelope(moduleName) {
  return Uint8Array.from(Buffer.from(`authst trace common ${moduleName}`));
}

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

test('blocks the captured bottom live module despite common auth and trace fields', () => {
  const body = nativeEnvelope(
    'mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab136 ' +
    'mlive.recommend.MliveRecommendCentralPageSvr'
  );

  assert.deepEqual(requestCleaner.decideRequest({
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body
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
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body
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
    url: 'https://u6.y.qq.com/cgi-bin/musics.fcg',
    body
  }), { block: false, categories: ['video'] });
});
