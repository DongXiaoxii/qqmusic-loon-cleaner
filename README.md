# QQ Music Loon Cleaner

Configurable aggressive Loon plugin for iOS QQ Music splash ads, popups, operation cards, unwanted entries, and telemetry.

## Loon Import

Use this plugin URL after the repository is pushed:

```text
https://raw.githubusercontent.com/DongXiaoxii/qqmusic-loon-cleaner/main/QQMusic.AggressiveCleaner.plugin
```

The plugin references:

```text
scripts/qqmusic_cleaner.js
scripts/qqmusic_request.js
```

## Loon switches

Open the plugin detail page in Loon to control each category independently. Every switch defaults to on:

- `[广告] 屏蔽开屏广告`
- `[广告] 屏蔽弹窗与气泡`
- `[广告] 屏蔽横幅与运营卡片`
- `[入口] 屏蔽直播`
- `[入口] 屏蔽视频与短视频`
- `[入口] 屏蔽商城、活动与福利`
- `[推荐] 屏蔽推广推荐内容`
- `[隐私] 屏蔽埋点与上报`

After installing a new plugin version, refresh it in Loon and completely restart QQ Music. Changing one switch only affects its own category.

The request controller does not modify QQ Music's `m-encoding` or `accept-encoding` headers. Requests containing playback, search, login, lyrics, songs, albums, artists, playlists, or unknown mixed modules are deliberately allowed. The response cleaner only modifies JSON that Loon can parse safely.

## Files

- `QQMusic.AggressiveCleaner.plugin`: Loon plugin manifest.
- `scripts/qqmusic_request.js`: conservative request classifier and blocker.
- `scripts/qqmusic_cleaner.js`: response-body JSON cleaner.
- `DESIGN.md`: design spec.
- `IMPLEMENTATION_PLAN.md`: implementation plan.

## Verification

```bash
node --test
node --check scripts/qqmusic_request.js
node --check scripts/qqmusic_cleaner.js
```

Original Loon captures can contain account identifiers and tokens. Keep ZIP/HAR captures out of Git.
