# 微信订阅消息真实提醒设计

## 目标

把 `notification_jobs` 从内部 mock 派发升级为可验证的微信订阅消息链路。队列生成、用户订阅授权、外部发送三层保持独立，只有微信发送 API 返回 `errcode=0` 才能将任务标记为 `sent`。

## 边界

- 保留阶段 A 已有的复习/读诵任务生成、去重和 mastered 抑制逻辑。
- 不修改商城和读诵播放决策。
- 所有测试中的微信 HTTP 均通过注入 `fetch` 模拟，不访问真实微信端点。
- `wechat_subscribe` 默认关闭，不能通过通用设置 API 直接开启；只有已认证用户提交至少一个 `accept` 授权结果后才开启。

## 架构

1. `wechatSubscribeConfig` 解析 `WECHAT_SUBSCRIBE_TEMPLATES_JSON`。每个 template key 配置 `templateId`、`label`、`page`、`fields` 和可选 `aliases`。公开 capabilities 仅返回 `key/templateId/label`。
2. `notification_subscriptions` 保存用户对每个模板的 `accept/reject/ban` 状态、授权和消费时间；独立幂等记录保存每次授权 API 的响应。
3. `wechatAccessToken` 缓存 token，提前过期并复用并发请求；`wechatSubscribeSender` 负责字段映射和发送，token 无效错误只刷新重试一次。
4. `notificationDispatcher` 校验 channel、模板映射、openid 和未消费授权，再调用 sender。repository 仅提供到期任务读取与原子成功/失败记录。
5. profile 在页面加载时缓存 capabilities；用户点击开启时，在 tap 调用栈内直接调用 `wx.requestSubscribeMessage({ tmplIds })`，随后逐模板用 authenticated、带 `Idempotency-Key` 的 API 保存结果。

## 状态语义

- 成功：`attempt_count + 1`，`status=sent`，写入 `sent_at/provider_message_id/provider_response`，原子消费对应授权。
- 可重试失败：`attempt_count + 1`；不足 3 次保持 `pending` 并写 `next_retry_at` 退避时间。
- 永久失败或第 3 次失败：`status=failed`，写 `last_error/provider_response`，不写 `sent_at`。
- 缺配置、缺 openid、无未消费 accept、拒绝、API 不可用都不得显示或记录为已开启/已发送。

## 验证

覆盖配置解析、前端手势合同、授权 auth/幂等、token 缓存与单次刷新、发送成功/失败、前置条件、退避和最终失败、授权消费、memory/PostgreSQL parity，以及完整 `npm test`、真实 PostgreSQL gate、`npm run check`、相关 `node --check`、UI parity、`git diff --check`。
