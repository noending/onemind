# oneMind 自动开发 Loop

## 目标

把当前仓库的开发推进方式固定成一个可重复执行的循环：

1. 自动挑选下一个最该做的工作流。
2. 一次只做一个最小闭环子任务。
3. 代码改完立刻跑静态检查和页面基线检查。
4. 涉及小程序页面时，使用微信开发者工具做模拟器验证。
5. 每一轮都回写进度文档，而不是只改代码不改状态。

## Loop 输入

- `docs/EXECUTION_TASKS.md`
- `docs/MULTI_PLATFORM_PLAN.md`
- `docs/PHASE2_VALIDATION_REPORT.md`
- `tools/dev-loop.mjs`

## 启动命令

先看下一轮该做什么：

```bash
cd /Users/liam/Documents/workspace/oneMind/tools
npm run loop:next
```

如果要给 agent 或其他脚本消费结构化输出：

```bash
cd /Users/liam/Documents/workspace/oneMind/tools
npm run loop:next:json
```

如果要看当前所有工作流状态：

```bash
cd /Users/liam/Documents/workspace/oneMind/tools
npm run loop:list
```

## 标准循环

### 1. 选任务

运行 `npm run loop:next`，拿到：

- 当前推荐工作流
- 推荐原因
- 主要文件
- 未完成子任务
- 自动检查命令
- 文档回写位置

规则：

- 默认只推进一个工作流，不跨两个大模块同时改。
- 每轮最多完成 1 到 2 个紧密相关的 checkbox 子任务。
- 如果当前工作流被外部条件阻塞，先回写 `BLOCKED`，再切下一个。

### 2. 做最小实现

实现时遵守：

- 先改最小闭环，不一次性把整个工作流做完。
- 优先复用现有页面、接口、数据结构，不新增不必要抽象。
- 涉及 `pages/*` 时，优先保持现有视觉基线和页面结构。
- 涉及 `backend/*` 时，优先保持已有接口契约和本地兜底逻辑。

### 3. 跑自动检查

按工作流输出的建议命令执行。常见规则：

- 改前台页面：
  - `node tools/check-<page>-parity.mjs`
- 改多个前台页面：
  - `node tools/check-ui-parity.mjs`
- 改后端：
  - `cd backend && npm run check`
- 改管理后台：
  - `cd backend && npm run admin:build`

### 4. 做交互验证

#### 4.1 小程序页面验证

当改动涉及：

- `pages/home`
- `pages/library`
- `pages/practice`
- `pages/recitation`
- `pages/profile`
- `pages/shop`

则必须补一轮微信开发者工具验证。推荐通过 `computer-use` 执行。

验证前先做两件事：

1. 确认微信开发者工具当前打开的 `projectpath` 是本仓库：
   - `/Users/liam/Documents/workspace/oneMind`
2. 确认模拟器机型至少覆盖：
   - `iPhone 15 Pro Max`

推荐验证动作：

1. 编译当前项目。
2. 进入受影响页面。
3. 检查安全区、底栏、标题、主要操作按钮是否正常。
4. 检查本轮改动对应的主交互。
5. 若有空状态或异常分支，至少手动走一条。
6. 记录 PASS / FAIL / BLOCKED。

#### 4.2 管理后台验证

当改动涉及：

- `backend/admin-app/*`
- `backend/src/routes.js`
- `backend/src/repositories/postgresStore.js`

则补一轮后台页验证。可用浏览器技能，或用 `computer-use` 控制浏览器。

推荐动作：

1. 启动后端服务。
2. 打开 `/admin`。
3. 用默认管理员登录。
4. 验证本轮改动对应的筛选、列表、表单或统计区。
5. 检查错误提示与空状态是否可用。

### 5. 回写文档

每轮完成后至少同步下面两个文件：

- `docs/EXECUTION_TASKS.md`
- `docs/MULTI_PLATFORM_PLAN.md`

如果本轮做的是多端验证，还要同步：

- `docs/PHASE2_VALIDATION_REPORT.md`

回写原则：

- 子任务完成：把对应 `[ ]` 改成 `[x]`
- 阶段性完成：更新章节状态
- 被卡住：写清阻塞项、责任条件、下一步
- 验证完成：把矩阵从“待复测/待验证”改成真实结果

### 6. 结束条件

满足以下任一条件后结束当前 loop 轮次：

- 当前最小子任务已完成，且检查通过
- 出现外部阻塞，已回写文档
- 需要用户提供账号、配置、素材或真实环境

然后重新执行：

```bash
cd /Users/liam/Documents/workspace/oneMind/tools
npm run loop:next
```

## 推荐执行顺序

当前默认顺序与 `docs/EXECUTION_TASKS.md` 一致：

1. `6.2` 后台升级为运营控制台
2. `6.3` 内容管理补齐审核与版本操作
3. `6.4` 今日页按三分组展示与节日直达
4. `6.5` 商城补持久化与转化路径
5. `6.6` 节日专题运营增强

同时保留三个阶段门禁任务：

1. Phase 1 微信开发者工具 iPhone 机型基准复测
2. Phase 2 四端验证回写
3. Phase 3 真链路联调

## 给 Agent 的执行口令

可以直接把下面这段作为下一轮开发提示词：

```text
按 docs/AUTO_DEV_LOOP.md 执行 oneMind 自动开发 loop。
先运行 tools/dev-loop.mjs 选择下一个工作流。
每轮只完成一个最小闭环子任务。
改完后运行脚本建议的检查命令。
如果涉及小程序页面，用 computer-use 控制微信开发者工具完成模拟器验证。
如果涉及管理后台，用浏览器或 computer-use 做功能验证。
完成后回写 docs/EXECUTION_TASKS.md、docs/MULTI_PLATFORM_PLAN.md，必要时回写 docs/PHASE2_VALIDATION_REPORT.md。
然后再进入下一轮。
```
