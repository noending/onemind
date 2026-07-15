# Phase 2 多端验证报告

## 当前阶段

状态：已启动，当前仅聚焦微信小程序。

目标：

- 先完成微信小程序模拟器基准复测。
- 当前轮次不展开 iOS MiniApp、Android MiniApp、HarmonyOS / OHOS MiniApp 验证。
- 每完成一个微信专项，都回写 `MULTI_PLATFORM_PLAN.md` 的验证矩阵。

## 1. 配置基线检查

检查日期：2026-05-25

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `project.config.json` JSON 解析 | 通过 | `projectArchitecture` 为 `multiPlatform` |
| `project.miniapp.json` JSON 解析 | 通过 | 已包含 `mini-ios`、`mini-android`、`mini-ohos` |
| `app.miniapp.json` JSON 解析 | 通过 | 已配置微信小程序适配信息 |
| `i18n/base.json` JSON 解析 | 通过 | 应用名称为“一念法藏” |
| `miniapp/ios/i18nInfo.json` JSON 解析 | 通过 | iOS 名称信息存在 |
| `miniapp/android/i18nInfo.json` JSON 解析 | 通过 | Android 名称信息存在 |
| `app.json` JSON 解析 | 通过 | 页面入口和全局组件配置可解析 |
| Android native resource 目录 | 通过 | `miniapp/android/nativeResources` 已存在 |
| 多端自检结果记录 | 通过 | “我的”页支持手动标记待复测 / 通过 / 失败，并持久化到本地 |

## 2. 已确认的端配置

### 微信小程序

- `simulatorType`: `wechat`
- `compileType`: `miniprogram`
- `appid`: `wx852e7aca1252a0e7`
- 当前作为前台 MVP 的基准验证端。

### iOS MiniApp（暂不纳入本轮）

- `sdkVersion`: `1.7.1`
- `toolkitVersion`: `0.0.9`
- `enableOpenUrlNavigate`: `true`
- `enableVConsole`: `open`

待补：

- iOS 图标资源。
- iOS 启动图。
- iOS 隐私说明按真实能力收敛。

### Android MiniApp（暂不纳入本轮）

- `sdkVersion`: `1.6.24`
- `toolkitVersion`: `0.11.0`
- `enableVConsole`: `open`
- `privacy.enable`: `true`
- `resourcePath`: `miniapp/android/nativeResources`

待补：

- Android 图标资源。
- Android 启动图。
- Android 隐私说明细化。

### HarmonyOS / OHOS MiniApp（暂不纳入本轮）

- `sdkVersion`: `0.5.1`

待补：

- 端侧图标与启动资源确认。
- 通知、文件权限、音频能力验证。

## 3. 当前阻塞项

### P0: 需要真实素材后补齐

- Android 图标：`hdpi`、`xhdpi`、`xxhdpi`、`xxxhdpi` 当前为空。
- Android 启动图：`hdpi`、`xhdpi`、`xxhdpi` 当前为空。
- iOS 图标：`mainIcon120`、`mainIcon180`、`spotlightIcon80`、`spotlightIcon120`、`settingsIcon58`、`settingsIcon87`、`notificationIcon40`、`notificationIcon60`、`appStore1024` 当前为空。
- iOS 启动图：`customImage` 当前为空。

### P1: 需要微信开发者工具模拟器确认

- 顶部安全区是否过高或过低。
- 底栏是否被系统手势条遮挡。
- 商城图片和唐卡图片是否正常显示。
- SVG 底栏图标是否在所有端正常渲染。
- 本地存储是否在端容器内稳定保留。
- 页面跳转是否符合端容器行为。
- `pages/library/index` 进入 `pages/practice/index` 后，模拟器是否仍残留旧 webview 叠层并影响底栏点击取证。

### P2: 后续真实能力接入前确认

- 微信订阅消息模板。
- iOS / Android / OHOS 系统通知能力。
- 音频播放能力。
- 图片缓存与文件访问策略。

## 4. 微信小程序基准复测清单

需要在微信开发者工具模拟器中人工完成：

1. 今日页

- 日期显示正确。
- 有计划时展示待复习。
- 无计划时展示空状态。
- 点击待复习进入训练页。
- 底栏显示：今日、选内容、商城、我的。

2. 选内容页

- 筛选按钮正常。
- 内容卡片不溢出。
- 点击内容弹出计划方案。
- 接受方案后进入训练页。

3. 训练页

- 训练页为二级页，结构上只校验返回、内容与反馈，不以“同页直跳我的”为通过条件。
- 顶部返回不与状态栏重叠。
- 训练卡片文字不溢出。
- 三个反馈按钮完整显示。
- 点击反馈后进度可同步到我的页。
- 完成后可看到下一段推荐。

4. 商城页

- 音乐列表图片正常。
- 商品标题不竖排、不溢出。
- 唐卡 / 能量画 tab 正常切换。
- 底栏 active 状态正确。

5. 我的页

- 当前端识别正确。
- 复习计划内容显示在我的页。
- 复习中 / 已背会空状态正确。
- 多端自检状态显示正确。
- 点击多端自检项可在“待复测 / 通过 / 失败”间切换。
- 重置自检可清除人工标记。
- 计划按钮可进入二级计划页。

## 5. Phase 2 验证记录

| 端 | 状态 | 记录 |
| --- | --- | --- |
| 微信小程序 | 进行中 | 静态配置通过；`2026-07-01` 已在微信开发者工具 `iPhone 15 Pro Max` 模拟器确认今日页三分组层级、底栏/安全区，以及“首页节日专题 -> 内容库筛选 / 训练页”“首页 -> 选内容 -> 科学背诵 -> 训练页”跳转 |
| iOS MiniApp | 暂缓 | 当前轮次不验证 |
| Android MiniApp | 暂缓 | 当前轮次不验证 |
| HarmonyOS / OHOS | 暂缓 | 当前轮次不验证 |

### 2026-07-01 微信今日页专项回归

- 环境：微信开发者工具 Stable `v2.01.2510290`，模拟器机型 `iPhone 15 Pro Max`。
- 结果：首页已能直接看出 `今日修持 -> 今日三类任务 -> 三组任务区` 的优先级结构，底栏和安全区未见遮挡。
- 结果：点击节日卡“查看专题内容”后，页面路径进入 `pages/library/index`，能看到专题筛选 pill、专题 spotlight 与 `清除` 按钮，且列表初始只显示该专题推荐内容。
- 结果：点击内容库里的 `清除` 后恢复全量内容列表，确认专题筛选可逆且不会卡死在专题范围内。
- 结果：点击节日推荐 chip `大悲咒·开头段` 后，页面路径直接进入 `pages/practice/index`，确认专题入口已经能把用户带到具体执行页。
- 备注：调试器仍显示一条 `Error: timeout` 告警，当前未阻断本轮首页与节日入口验收。

### 2026-07-01 微信商城持久化专项回归

- 环境：微信开发者工具 Stable `v2.01.2510290`，模拟器机型 `iPhone 15 Pro Max`。
- 路径：`pages/shop/index` -> 打开 `心经 · 梵唱合集` -> 加入购物车 -> 点击收藏 -> 刷新页面 -> 切换 `收藏` tab。
- 结果：打开商品详情后，“最近看过”统计会从 `0` 更新为 `1`，并在“最近看过”区新增对应记录。
- 结果：点击“加入购物车”后，右上角购物车角标、顶部“加购”统计与“意向记录”面板都会同步变为真实加购记录。
- 结果：点击收藏星标后，“收藏”计数变为 `1`，tab 文案更新为 `收藏 (1)`，切到收藏页后仅展示已收藏商品。
- 结果：点击模拟器“刷新页面”后，收藏 / 最近看过 / 加购三项状态保持不变，确认微信端本地存储可稳定保留商城偏好。
- 备注：调试器仍保留既有 `Error: timeout` 告警，本轮未发现由商城持久化改动新增的阻断性错误。

### 2026-07-01 微信主链路补测（首页 -> 选内容 -> 训练）

- 环境：微信开发者工具 Stable `v2.01.2510290`，模拟器机型 `iPhone 15 Pro Max`。
- 路径：`pages/home/index` -> 点击“去选内容” -> `pages/library/index` -> 点击 `六字大明咒` -> 点击 `开始科学背诵`。
- 结果：首页可正常进入选内容页，内容库可见 `六字大明咒 / 绿度母心咒 / 药师灌顶真言（简） / 心经·核心段 / 四弘誓愿 / 阿弥陀佛圣号 / 金刚经·结尾偈 / 大悲咒·开头段` 等内容卡。
- 结果：点击 `六字大明咒` 后，能稳定弹出“选择修持方式”方案层，显示 `1 建议天数 / 4 个拆段 / 3 条路径` 与 `开始科学背诵 / 开始趣味背诵 / 加入日常读诵` 三个动作按钮。
- 结果：点击 `开始科学背诵` 后，页面路径切换为 `pages/practice/index`，无障碍树可见 `六字大明咒 / 科学背诵 / 步骤 1 / 5 / 拆段练习 · 4 句 / 上一步 / 下一步`，确认“建计划 -> 训练页”链路已通过。
- 结果：代码交叉验证显示 `pages/library/index.js` 会在 `createPlanWithFallback(...)` 成功后才 `wx.navigateTo('/pages/practice/index?...&planId=...')`，因此本轮进入训练页也意味着计划创建已成功落地。
- 结构说明：`app.json` 中 `home/library/shop/profile` 为顶层页，`practice/recitation/plan` 为二级页；`pages/practice/index.wxml` 仅提供 `‹ 返回`，`app-tabbar` 仅挂载在四个顶层页，因此验收口径应为“训练反馈回写到我的页”而不是“训练页直接切我的页”。
- 修正：已将内容页的“开始科学背诵 / 加入日常读诵”改为成功后先关闭方案弹层，再跳 `practice/recitation` 二级页，降低开发者工具保留上一页遮罩的概率。
- 阻塞：当前微信开发者工具在进入 `pages/practice/index` 后仍保留 `pages/library/index` 的旧 webview 叠层，可见底栏但点击命中不稳定，导致“训练反馈后再联测我的页回写结果”暂未拿到稳定 UI 证据。
- 备注：调试器持续显示既有 `TypeError: Cannot read property '__subPageFrameEndTime__' of null` 与 `Error: timeout` 告警；本轮未阻断“首页 -> 选内容 -> 训练页”链路，但需单独排查其是否与叠层异常有关。

## 6. 下一步

1. 在微信开发者工具中完成微信小程序基准复测。
2. 将复测结果回写 `MULTI_PLATFORM_PLAN.md`。
3. 优先推进微信真实登录、订阅消息和通知降级链路。
4. 其他平台验证后续单独恢复，不作为当前阶段阻塞项。
