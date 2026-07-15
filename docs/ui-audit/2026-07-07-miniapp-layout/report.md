# 小程序页面比例与布局巡查报告

时间：2026-07-07 20:59 CST

## 巡查范围

- 视觉复核：今日、选内容、商城、我的、选内容方案弹层、科学背诵训练页。
- 结构与 parity 校验：今日、选内容、商城、我的、训练、读诵、计划。
- 验证环境：微信开发者工具 Stable 2.01.2510290，小程序模拟器，主要复核 iPhone 15 Pro Max；过程中也观察过 iPhone 12/13 Pro。
- 证据限制：本轮用 Computer Use 的可视状态与可访问性树做巡查；本机 `screencapture` 早前无法保存有效屏幕图，因此本报告没有本地 PNG 截图作为附件。

## 主要结论

- 主 tab 四页此前存在共同风险：`navigationStyle: "custom"` 下页面内容只避开了状态栏，没有充分避开微信右上胶囊。
- 已修复主 tab 顶部安全区：今日、选内容、商城、我的统一改为更保守的顶部留白，视觉上不再顶到刘海或胶囊。
- 首页额外修复了右上操作区：将日期/同步信息与“连续天数/刷新”拆成两行，避免按钮与微信胶囊横向重叠。
- 训练页从选内容真实入口打开后可用：顶部返回、步骤、查看全文、正文拼音/文字、底部上一步/下一步均未见遮挡。
- 仍需后续处理：主 tab 页面切换时商城/我的会出现整屏米色空白 loading，控制台仍有 1 条 `Error: timeout` 和若干 warning。

## 页面记录

1. 今日页：修复后顶部内容不再贴近刘海；首页按钮不再占用微信胶囊区域；首屏信息密度可接受。
2. 选内容页：标题、筛选条、节日筛选、长咒入口和内容卡片比例正常；进入时有 loading 卡片，不是纯空白。
3. 商城页：标题、hero、分类按钮、商品卡片比例正常；页面切换时出现短暂整屏空白 loading。
4. 我的页：头像、昵称、今日寄语和进度模块避开刘海；页面切换时同样出现短暂整屏空白 loading。
5. 选内容方案弹层：底部弹层没有被 home indicator 遮挡，三个方案按钮高度和间距可点。
6. 科学背诵训练页：短咒全文能单行展示；拼音与字逐项对应；底部操作栏在安全区上方。
7. 读诵页：本轮未完整视觉打开；`recitation` parity 校验通过，样式具备底部播放器安全区。
8. 计划页：本轮未完整视觉打开；代码结构使用 `app-header` 处理状态栏，样式校验未发现明显比例风险。

## 已修改

- `pages/home/index.wxss`：主 tab 顶部安全区改为 `124rpx`；首页顶栏改为可换行两行布局。
- `pages/library/index.wxss`：顶部安全区改为 `124rpx`。
- `pages/shop/index.wxss`：顶部安全区改为 `124rpx`。
- `pages/profile/index.wxss`：顶部安全区改为 `124rpx`。
- `docs/ui-parity/home.tokens.json`、`docs/ui-parity/library.tokens.json`、`docs/ui-parity/profile.tokens.json`：同步顶部 spacing token。

## 后续建议

- P1：给商城/我的 tab 切换补骨架屏或轻量 loading 内容，避免整屏空白。
- P2：清理开发者工具控制台 `Error: timeout` 与 warning，避免真实问题被旧错误淹没。
- P2：给自定义 tabbar 图标补可访问性标签；当前可访问性树显示为“未加标签的图片”。
- P3：下次用真实入口完整打开读诵页、计划页，并补可视截图证据。

## 验证命令

```bash
node tools/check-ui-parity.mjs
node --check pages/home/index.js
node --check pages/library/index.js
node --check pages/shop/index.js
node --check pages/profile/index.js
```

结果：以上命令均通过。
