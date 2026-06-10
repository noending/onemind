# Phase 2 多端验证报告

## 当前阶段

状态：已启动。

目标：

- 先完成微信小程序模拟器基准复测。
- 再按 iOS MiniApp、Android MiniApp、HarmonyOS / OHOS MiniApp 逐端验证。
- 每完成一个端，都回写 `MULTI_PLATFORM_PLAN.md` 的验证矩阵。

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

## 2. 已确认的多端配置

### 微信小程序

- `simulatorType`: `wechat`
- `compileType`: `miniprogram`
- `appid`: `wx852e7aca1252a0e7`
- 当前作为前台 MVP 的基准验证端。

### iOS MiniApp

- `sdkVersion`: `1.7.1`
- `toolkitVersion`: `0.0.9`
- `enableOpenUrlNavigate`: `true`
- `enableVConsole`: `open`

待补：

- iOS 图标资源。
- iOS 启动图。
- iOS 隐私说明按真实能力收敛。

### Android MiniApp

- `sdkVersion`: `1.6.24`
- `toolkitVersion`: `0.11.0`
- `enableVConsole`: `open`
- `privacy.enable`: `true`
- `resourcePath`: `miniapp/android/nativeResources`

待补：

- Android 图标资源。
- Android 启动图。
- Android 隐私说明细化。

### HarmonyOS / OHOS MiniApp

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

### P1: 需要逐端模拟器确认

- 顶部安全区是否过高或过低。
- 底栏是否被系统手势条遮挡。
- 商城图片和唐卡图片是否正常显示。
- SVG 底栏图标是否在所有端正常渲染。
- 本地存储是否在端容器内稳定保留。
- 页面跳转是否符合端容器行为。

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
| 微信小程序 | 待人工复测 | 静态配置通过，待模拟器视觉和流程确认 |
| iOS MiniApp | 待验证 | 配置存在，图标和启动图未补 |
| Android MiniApp | 待验证 | 配置存在，图标和启动图未补 |
| HarmonyOS / OHOS | 待验证 | 配置存在，端能力待验证 |

## 6. 下一步

1. 在微信开发者工具中完成微信小程序基准复测。
2. 将复测结果回写 `MULTI_PLATFORM_PLAN.md`。
3. 准备正式 App 图标和启动图素材。
4. 切换 iOS MiniApp 验证安全区、存储、跳转、图片和 SVG。
5. 再切换 Android MiniApp 与 HarmonyOS / OHOS 验证。
