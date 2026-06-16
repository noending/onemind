# 11 · 多端适配

## 1. 工程基线

- [project.config.json](file:///Users/liam/Documents/workspace/oneMind/project.config.json)
  - `projectArchitecture: "multiPlatform"`：声明为多端工程。
  - `simulatorType: "wechat"`：默认以 WeChat 模拟器为入口。
- [project.miniapp.json](file:///Users/liam/Documents/workspace/oneMind/project.miniapp.json)
  - `mini-ios` / `mini-android` / `mini-ohos` 三端分别配置 SDK 版本、扩展能力、图标、隐私文案、启动图等。
  - iOS 端提供 14 项 `privateDescriptions`（相册、相机、麦克风、定位、通讯录、日历、提醒事项、蓝牙、语音识别、本地网络、系统管理、照片库写入等）。
- [app.miniapp.json](file:///Users/liam/Documents/workspace/oneMind/app.miniapp.json)
  - `adapteByMiniprogram.userName: "gh_38a0a1d6a0a1"`：关联的微信小程序原始账号。
- [i18n/base.json](file:///Users/liam/Documents/workspace/oneMind/i18n/base.json)
  - `ios.name` / `android.name` / `common.name` 全部为 `一念法藏`。
- [miniapp/ios/i18nInfo.json](file:///Users/liam/Documents/workspace/oneMind/miniapp/ios/i18nInfo.json) / [miniapp/android/i18nInfo.json](file:///Users/liam/Documents/workspace/oneMind/miniapp/android/i18nInfo.json)
  - 端侧原生 i18n 元数据。

## 2. 平台识别与提醒策略

模块 [common/platform.js](file:///Users/liam/Documents/workspace/oneMind/common/platform.js)：

- `getPlatformInfo()`：基于 `wx.getSystemInfoSync()` 输出 `{ platform, hostName, system, model }`。
- `getPlatformLabel(info)`：根据 `system` 命中 `HarmonyOS` → `HarmonyOS MiniApp`，否则按 `platform` 区分 `iOS / Android`，再按 `hostName` 识别微信端。
- `getReminderStrategy()`：根据平台返回文案（订阅消息 / 系统通知 / 多端适配层 / 站内提醒）。
- `getReminderCapabilities()`：返回 `inbox` / `subscribe` / `system` 三档能力的 `available` / `ready` / `fallback` 状态。

## 3. 自检清单（Phase 2 验证）

`getPlatformChecklist()` 返回 5 项：

| Key | Title | 自动 | 备注 |
| --- | --- | --- | --- |
| `layout` | 布局与安全区 | 否 | 可手动切换 review/passed/failed。 |
| `asset` | 图片与 SVG | 否 | 可手动切换。 |
| `storage` | 本地存储 | 是 | 自动跑 `testStorage()` 写读删探针。 |
| `navigation` | 页面跳转 | 否 | 可手动切换。 |
| `reminder` | 提醒策略 | 是 | 系统固定为 passed。 |

存储位置：`oneMind.phase2.validation`，由 `toggleChecklistStatus(key)` 循环 `review → passed → failed → review`；`resetChecklistStatus()` 一键清空。

## 4. 我的页中的呈现

[pages/profile/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/profile/index.js)：

- `subTab === "platform"` 时渲染「平台信息卡 + 提醒能力 + 自检清单」。
- `refreshPlatformPanel()` 调 `getPlatformInfo` / `getPlatformLabel` / `getReminderStrategy` / `buildPlatformCapabilities` / `buildPlatformChecklist`。
- `toggleChecklistItem` 调用 `toggleChecklistStatus` 持久化校验结果。

## 5. 计划路线

权威版本见 [docs/MULTI_PLATFORM_PLAN.md](file:///Users/liam/Documents/workspace/oneMind/docs/MULTI_PLATFORM_PLAN.md)。当前阶段：

- Phase 1（前台 MVP）：可演示 / 闭环。
- Phase 2（多端验证）：四端逐项人工复测并回写 `docs/PHASE2_VALIDATION_REPORT.md`。
- Phase 3（后端 + Admin Web）：接口、权限、通知、组织、资产、审计。
- Phase 4：数字法藏权限管理 / 高级组织能力。

## 6. 端差异约束

- 核心记忆逻辑跨端一致；端差异集中在：
  - 提醒渠道（微信订阅 / 系统通知 / 多端适配层）。
  - 音频 / 媒体权限（`useExtendedSdk`）。
  - 启动图标 / 启动图（`icons` / `splashScreen` / `splashscreen`）。
  - 隐私文案（仅 iOS）。
  - 底部导航（小程序自身 tabBar 与项目自定义 `app-tabbar` 的边界）。

## 7. 调试建议

- 端差异调试时，先在 WeChat 模拟器确认逻辑无错，再切换到目标端（`simulatorType` 切到目标 MiniApp）。
- 平台识别结果可通过「我的」页 `subTab: "platform"` 实时查看。
- 自检清单的 `storage` 项可快速判断当前容器是否具备本地存储能力。
