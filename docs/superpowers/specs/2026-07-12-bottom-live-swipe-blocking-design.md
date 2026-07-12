# QQ 音乐底部直播与刷歌精确屏蔽设计

日期：2026-07-12

## 目标

让现有两个 Loon 开关真正控制 QQ 音乐底部入口：

- `block_live=true` 时直接屏蔽底部直播入口及其独立直播标签、推荐请求；`false` 时放行。
- `block_video=true` 时直接屏蔽底部刷歌入口及明确的视频/短视频 Feed 请求；`false` 时放行。

不新增第九个开关。现有 `[入口] 屏蔽视频与短视频` 在 Loon 中改名为 `[入口] 屏蔽刷歌、视频与短视频`，参数名仍保持 `block_video`，避免破坏已有配置。

## 抓包证据

最新 Loon 归档显示：

- 底部直播标签配置来自 `mlive.recommend.MliveRecommendCentralPageSvr.GetDynamicTab`。
- 直播推荐和相关状态来自独立的 `mlive.*` 模块。
- 底部刷歌配置来自 `music.recommend.RecommendClassifyConfigSrv.GetClassifyConfig`。
- 对应响应中明确包含“刷歌”和“猜你喜欢-沉浸刷歌”。
- 视频 Feed 响应包含 `QMVideoCardGetFeedListCgi`，但部分请求体没有可见 ASCII 模块名，不能仅凭通用 `/cgi-bin/musics.fcg` URL 安全区分。

当前请求控制器未能阻断大多数原生直播、弹窗和广告模块，根因是它在整个二进制请求信封上运行核心正则。所有原生请求都可能携带公共 `auth` 或 `trace` 字段：`auth` 触发核心保护，`trace` 又误触发遥测分类，导致真实业务模块被放行或错误叠加类别。

## 方案

### 模块级分类

请求控制器先从请求体中提取 `music.*` 和 `mlive.*` 模块标识，再对这些标识分类。公共二进制信封不再参与核心、直播、刷歌或遥测分类。

分类优先级：

1. 精确直播模块
2. 精确刷歌/视频模块
3. 其他已知屏蔽类别
4. 核心音乐模块
5. 未知模块

服务名可能和完整方法名同时出现。例如 `music.lvz.VocalAccompCgi` 本身没有广告关键词，但它是已分类方法 `music.lvz.VocalAccompCgi.CheckAdEnable` 的前缀。此类服务名前缀不视为未知模块。

### 直播规则

以下独立模块归类为 `live`：

- 任意 `mlive.*` 模块。
- 已有直播文本/URL信号仅用于专用 URL，不扫描公共信封。

当 `block_live=true`，且请求不含核心或真正未知模块时中断请求。当 `block_live=false`，只要识别到直播模块就立即放行，不允许其他公共字段把它重新归类并阻断。

### 刷歌与视频规则

以下模块归类为 `video`：

- `music.recommend.RecommendClassifyConfigSrv.GetClassifyConfig`，这是抓包确认的底部刷歌配置。
- 明确带 `music.video`、`ShortVideo`、`VideoCardGetFeedList` 等视频/短视频标识的模块。

不得用笼统的 `music.recommend` 匹配刷歌，因为它也覆盖普通歌曲推荐。只有精确刷歌模块和明确视频模块受 `block_video` 控制。

当 `block_video=false`，上述请求立即放行。

### 核心与未知保护

核心正则只检查提取出的模块标识，保护歌曲、播放地址、歌词、搜索、登录、专辑、歌手、歌单、账号和会员能力。公共字段中的 `auth` 不再触发核心保护。

若请求同时包含屏蔽模块与核心模块，放行。若存在不能解释且不是已分类方法前缀的模块，放行。

### 遥测收敛

遥测只匹配明确模块，例如 `PushReport`、`DeviceTokenReport`、`NoticeOaid`、`Tracking` 和 `Exposure`。公共 `trace` 字段不再作为请求侧遥测信号。响应侧的 `traceid` 清理保持现状。

## 数据流

1. 读取 `$request.body`，将 `Uint8Array` 转为可搜索的 ASCII 文本。
2. 提取模块标识并去除调用序号后缀。
3. 识别直播或刷歌/视频精确模块。
4. 若对应开关为关闭，立即 `$done({})` 放行。
5. 若开关开启，检查同一请求是否含核心或真正未知模块。
6. 安全独立请求调用 `$done()` 中断；混合或未知请求调用 `$done({})` 放行。

URL 中存在明确 `/splash`、`/report` 等专用路径时，可以在没有模块标识的情况下按原类别处理；通用 `musics.fcg` URL 本身没有类别。

## 测试

必须先用失败测试复现当前误判，再修改实现：

1. 含公共 `authst`、`trace` 的直播动态标签请求在 `block_live=true` 时仍被阻断。
2. 同一直播请求在 `block_live=false` 时放行。
3. 含公共 `authst`、`trace` 的精确刷歌配置请求在 `block_video=true` 时被阻断。
4. 同一刷歌请求在 `block_video=false` 时放行。
5. 普通 `music.recommend` 模块不因视频开关被阻断。
6. `PushReport` 等明确遥测模块受遥测开关控制，普通 `trace` 信封不产生遥测类别。
7. 视频/直播与歌曲、歌单或未知模块混合时继续放行。
8. Manifest 显示 `[入口] 屏蔽刷歌、视频与短视频`，参数名仍为 `block_video`。

## 验收标准

- 所有开关默认开启时，底部直播和刷歌对应的独立配置请求被中断。
- 关闭直播开关后，所有直播模块放行。
- 关闭视频开关后，刷歌配置与明确视频模块放行。
- 播放、搜索、登录、歌词、歌曲与歌单功能不被请求控制器中断。
- 不修改 `m-encoding` 或 `accept-encoding`，原生 `m1` 请求继续返回 HTTP 200、业务 `code=0`。
- 原始抓包及任何账号标识不进入 Git。
