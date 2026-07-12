# 微信订阅消息真实提醒实施报告

日期：2026-07-12

## 结果

- 队列层：保留阶段 A 的复习/读诵任务生成、去重和 mastered 抑制；repository 仅列出到期 pending 与原子记录结果。
- 授权层：profile 在用户点击开启的调用栈内直接调用 `wx.requestSubscribeMessage`；模板 ID 来自 capabilities；每个结果通过 authenticated、带 `Idempotency-Key` 的 API 保存。
- 外发层：access token 提前过期缓存并复用并发请求；token 无效只刷新重试一次；微信仅在 `errcode=0` 时进入 sent。
- 状态层：保存 attempt、退避时间、错误、provider message ID/response；可重试最多 3 次，永久失败直接 failed；成功原子消费授权并在没有剩余授权时关闭 channel。
- 数据层：`schema.sql` 与 runtime migration 对齐；memory/PostgreSQL 暴露同一通知接口。

## TDD 证据

- 初始 RED：新增的配置、sender、dispatcher、repository、路由和 profile 合同共 15 项全部因能力缺失失败。
- 定向 GREEN：配置/客户端/dispatcher、memory repository、授权路由、profile 用户手势和真实 PostgreSQL gate 均通过。
- 外部 HTTP：测试使用注入 fake fetch 或 mock `wx.requestSubscribeMessage`，没有访问真实微信端点。

## 最终门禁

- `cd backend && npm test`：212 tests，181 pass，31 个既有条件性 skip，0 fail。
- `node --test test/notification-postgres-gate.test.js`：1 pass，0 fail，0 skip，真实本地 PostgreSQL 执行。
- `cd backend && npm run check`：通过，覆盖 routes、memory/PG repository、runtime schema、4 个通知服务、client API 和 profile。
- `node tools/check-ui-parity.mjs`：六页 89/89 项通过（含 profile 14/14、recitation 19/19、shop 13/13）。
- `git diff --check`：通过。

## 外部配置

- `WECHAT_LOGIN_MODE=real`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_SUBSCRIBE_TEMPLATES_JSON`
- 微信公众平台中与配置一致且已启用的订阅消息模板、字段名和小程序 page。

## 提交

- `98a67c02 feat: implement real WeChat notification delivery`
