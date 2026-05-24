# 一念法藏

一念法藏是一个基于微信开发者工具多端 MiniApp 架构的项目，目标通过同一套小程序业务代码支持：

- 微信小程序
- iOS MiniApp 容器
- Android MiniApp 容器
- HarmonyOS / OHOS MiniApp 容器

产品方向是以科学记忆佛经、咒语、短偈和经文片段为入口，后续逐步扩展到节日内容、音频、唐卡、能量画和数字法藏权限管理。

## 技术路线

当前项目不是 `uni-app`、不是 `Taro`，而是微信开发者工具生成的多端小程序工程。

关键配置：

- `project.config.json`: 微信开发者工具项目配置，`projectArchitecture` 为 `multiPlatform`。
- `project.miniapp.json`: 多端 MiniApp 配置，包含 `mini-ios`、`mini-android`、`mini-ohos`。
- `app.miniapp.json`: 小程序适配 MiniApp 的配置。
- `miniapp/ios`、`miniapp/android`: 端侧 MiniApp 资源与国际化信息。

业务代码采用原生小程序文件组织：

- `app.json`
- `app.js`
- `app.wxss`
- `pages/**/*.wxml`
- `pages/**/*.wxss`
- `pages/**/*.js`
- `pages/**/*.json`

## 当前 MVP

已补齐 5 个首期页面：

- `pages/home`: 今日复习与推荐内容。
- `pages/library`: 内容库，支持开始训练和生成计划。
- `pages/practice`: 分段记忆训练。
- `pages/plan`: 复习计划与记忆节点。
- `pages/profile`: 当前端信息与提醒策略。

公共逻辑：

- `common/content.js`: 首批内容数据。
- `common/memory.js`: 记忆曲线计划生成与本地存储。
- `common/platform.js`: 多端平台识别与提醒策略说明。

## 下一步

- 在微信开发者工具中打开当前目录。
- 使用微信小程序模拟器确认基础页面可运行。
- 切换 MiniApp 多端模拟器或构建配置，分别验证 iOS、Android、OHOS 容器行为。
- 后续接入真实内容后台、订阅消息、系统通知和数字法藏权限管理。
