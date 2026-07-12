# 微信订阅消息真实提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让微信订阅消息授权和派发成为真实、可审计、失败可重试的通知链路。

**Architecture:** 配置、授权存储、微信 HTTP 客户端和 dispatcher 分层；repository 只做同步数据操作，dispatcher 负责异步编排。memory 与 PostgreSQL 暴露同一接口，路由和小程序只依赖这些稳定合同。

**Tech Stack:** Node.js 18、`node:test`、原生 `fetch` 注入、微信小程序 API、PostgreSQL/psql。

## Global Constraints

- 不回退现有改动，不修改商城和读诵播放决策。
- 所有外部 HTTP 测试必须 mock。
- 只有微信返回 `errcode=0` 才能标记 `sent`。
- 最多尝试 3 次，token 无效只强制刷新重试 1 次。

---

### Task 1: 配置与授权合同

**Files:** `backend/src/services/wechatSubscribeConfig.js`、`backend/src/routes.js`、两种 repository、schema/runtime migration、对应测试。

- [ ] 先写配置解析、capabilities、auth、幂等和 accept 才启用的失败测试。
- [ ] 运行定向测试并确认因接口缺失失败。
- [ ] 实现最小配置与授权存储接口并跑绿。

### Task 2: 微信客户端

**Files:** `backend/src/services/wechatAccessToken.js`、`backend/src/services/wechatSubscribeSender.js`、对应测试。

- [ ] 先写 token 并发缓存、提前过期、无效 token 单次刷新、字段映射和微信错误测试。
- [ ] 确认 RED 后实现注入式 fetch 客户端并跑绿。

### Task 3: Dispatcher 与数据状态

**Files:** `backend/src/services/notificationDispatcher.js`、两种 repository、管理路由、对应测试。

- [ ] 先写成功、缺前置条件、重试、最终失败、授权消费和 provider 统计测试。
- [ ] 确认 RED 后移除 mock dispatch，实现原子结果记录并跑 memory/PG parity。

### Task 4: 小程序用户手势

**Files:** `common/api.js`、`pages/profile/index.js`、profile 合同测试。

- [ ] 先写 capabilities 获取、tap 内调用 `requestSubscribeMessage`、逐模板幂等保存及错误文案测试。
- [ ] 确认 RED 后实现，至少一个 accept 才更新为启用。

### Task 5: 文档、报告与门禁

**Files:** `docs/API_CONTRACT.md`、`backend/README.md`、`backend/.env.example`、`.superpowers/sdd/wechat-notification-report.md`。

- [ ] 更新配置和 API 合同，记录真实外部配置项。
- [ ] 运行全量测试、真实 PG gate、check、node check、UI parity、diff check。
- [ ] 审查 diff，提交一个或少量清晰提交并记录提交号。
