# Task 6A 报告：计划设置纯 view-model

## 完成内容

- 新增 `common/plan-setup.js`，以 CommonJS 导出 `buildScopeOptions` 和 `buildRecommendationCards`。
- 范围选项固定先返回全文，再返回审核通过的 section；空 sections 仍保留全文入口。
- 推荐卡片固定返回 7、14、28、custom；固定卡片包含新单元数、预计复习数、预计分钟数、强度和推荐标记。
- 推荐天数兼容 `recommendedTargetDays` 与 `targetDays`，custom 仅表达入口，不伪造数值天数。
- 计算复用 `common/adaptive-memory.js` 的 `recommendPlan` 与 `normalizeTargetDays`，未复制核心公式。
- 测试覆盖空 sections、84 单元/14 天计算、推荐标记、输入不变性及 custom 边界。

## TDD 记录

- RED：先运行聚焦测试，因 `common/plan-setup.js` 尚不存在而失败。
- GREEN：补充纯 view-model 实现后，聚焦测试 7/7 通过。

## 验证

- `node --test test/plan-setup-view-model.test.js`：7/7 通过。
- `npm test`：63 项通过，17 项按环境跳过，0 失败。
- `node --check ../common/plan-setup.js`：通过。
- `git diff --check`：通过。
