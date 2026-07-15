#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const executionTasksPath = path.join(repoRoot, "docs", "EXECUTION_TASKS.md");

const workstreamPriority = ["6.2", "6.3", "6.4", "6.5", "6.6"];

const phaseGateCommands = [
  "前台页面验证可用 computer-use 控制微信开发者工具完成",
  "多端验证结果需同步回写 docs/PHASE2_VALIDATION_REPORT.md 与 docs/MULTI_PLATFORM_PLAN.md",
  "真实链路任务开始前先确认微信开放平台配置、数据库和本地后端可用"
];

function readExecutionTasks() {
  return fs.readFileSync(executionTasksPath, "utf8");
}

function normalizeLine(line) {
  return line.trim();
}

function extractPhaseTasks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const phases = [];
  let current = null;
  let inTasks = false;

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    const phaseMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (phaseMatch) {
      const phaseNo = Number(phaseMatch[1]);
      if (phaseNo >= 1 && phaseNo <= 3) {
        current = {
          id: phaseNo,
          title: phaseMatch[2],
          tasks: []
        };
        phases.push(current);
      } else {
        current = null;
      }
      inTasks = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line === "任务：") {
      inTasks = true;
      continue;
    }

    if (line.startsWith("完成标准：") || line.startsWith("## ")) {
      inTasks = false;
    }

    if (!inTasks) {
      continue;
    }

    const taskMatch = line.match(/^(\d+)\.\s+`(TODO|DOING|DONE|BLOCKED)`\s+(.+)$/);
    if (taskMatch) {
      current.tasks.push({
        index: Number(taskMatch[1]),
        status: taskMatch[2],
        text: taskMatch[3]
      });
    }
  }

  return phases;
}

function extractWorkstreams(markdown) {
  const lines = markdown.split(/\r?\n/);
  const workstreams = [];
  let current = null;
  let mode = "";

  function pushCurrent() {
    if (!current) {
      return;
    }
    current.openTasks = current.tasks.filter((task) => !task.done);
    workstreams.push(current);
  }

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    const headingMatch = line.match(/^###\s+(\d+\.\d+)\s+(.+)$/);
    if (headingMatch) {
      pushCurrent();
      current = {
        id: headingMatch[1],
        title: headingMatch[2],
        goals: [],
        files: [],
        tasks: [],
        statuses: []
      };
      mode = "";
      continue;
    }

    if (!current) {
      continue;
    }

    if (line === "目标：") {
      mode = "goal";
      continue;
    }
    if (line === "主要文件：") {
      mode = "files";
      continue;
    }
    if (line === "任务：") {
      mode = "tasks";
      continue;
    }
    if (line === "状态：") {
      mode = "status";
      continue;
    }

    if (!line) {
      continue;
    }

    if (mode === "goal" && line.startsWith("- ")) {
      current.goals.push(line.slice(2));
      continue;
    }

    if (mode === "files" && line.startsWith("- ")) {
      const fileMatch = line.match(/`([^`]+)`/);
      current.files.push(fileMatch ? fileMatch[1] : line.slice(2));
      continue;
    }

    if (mode === "status" && line.startsWith("- ")) {
      current.statuses.push(line.slice(2));
      continue;
    }

    if (mode === "tasks") {
      const taskMatch = line.match(/^- \[( |x)\]\s+(.+)$/i);
      if (taskMatch) {
        current.tasks.push({
          done: taskMatch[1].toLowerCase() === "x",
          text: taskMatch[2]
        });
      }
    }
  }

  pushCurrent();
  return workstreams;
}

function getValidationCommands(files) {
  const commands = new Set();
  const normalized = files.map((file) => file.replace(/\\/g, "/"));

  if (normalized.some((file) => file.startsWith("pages/home"))) {
    commands.add("node tools/check-home-parity.mjs");
  }
  if (normalized.some((file) => file.startsWith("pages/library"))) {
    commands.add("node tools/check-library-parity.mjs");
  }
  if (normalized.some((file) => file.startsWith("pages/profile"))) {
    commands.add("node tools/check-profile-parity.mjs");
  }
  if (normalized.some((file) => file.startsWith("pages/practice"))) {
    commands.add("node tools/check-practice-parity.mjs");
  }
  if (normalized.some((file) => file.startsWith("pages/recitation"))) {
    commands.add("node tools/check-recitation-parity.mjs");
  }
  if (normalized.some((file) => file.startsWith("pages/shop"))) {
    commands.add("node tools/check-shop-parity.mjs");
  }
  if (normalized.some((file) => file.startsWith("backend/src"))) {
    commands.add("cd backend && npm run check");
  }
  if (normalized.some((file) => file.startsWith("backend/admin") || file.startsWith("backend/admin-app"))) {
    commands.add("cd backend && npm run admin:build");
  }

  return Array.from(commands);
}

function getManualChecks(workstream) {
  const files = workstream.files.join(" ");
  const checks = [];

  if (/pages\/(home|library|practice|recitation|profile|shop)/.test(files)) {
    checks.push("确认微信开发者工具 projectpath 指向 /Users/liam/Documents/workspace/oneMind");
    checks.push("编译并使用 iPhone 15 Pro Max 模拟器验证受影响页面");
    checks.push("检查安全区、底栏、标题层级和本轮主交互是否正常");
  }

  if (/backend\/admin|backend\/admin-app|backend\/src/.test(files)) {
    checks.push("启动 backend 服务并打开 /admin 做一轮功能回归");
  }

  return checks;
}

function pickNextWorkstream(workstreams) {
  for (const id of workstreamPriority) {
    const found = workstreams.find((item) => item.id === id && item.openTasks.length);
    if (found) {
      return found;
    }
  }
  return workstreams.find((item) => item.openTasks.length) || null;
}

function buildOutput() {
  const markdown = readExecutionTasks();
  const phases = extractPhaseTasks(markdown);
  const workstreams = extractWorkstreams(markdown);
  const next = pickNextWorkstream(workstreams);

  const phaseGates = phases
    .map((phase) => ({
      id: phase.id,
      title: phase.title,
      openTasks: phase.tasks.filter((task) => task.status !== "DONE")
    }))
    .filter((phase) => phase.openTasks.length);

  return {
    generatedAt: new Date().toISOString(),
    source: "docs/EXECUTION_TASKS.md",
    next: next
      ? {
          id: next.id,
          title: next.title,
          reason: `按当前建议顺序，${next.id} 仍有未完成子任务，适合作为下一轮默认工作流。`,
          goals: next.goals,
          files: next.files,
          openTasks: next.openTasks.map((task) => task.text),
          validationCommands: getValidationCommands(next.files),
          manualChecks: getManualChecks(next),
          writebacks: [
            "docs/EXECUTION_TASKS.md",
            "docs/MULTI_PLATFORM_PLAN.md"
          ]
        }
      : null,
    phaseGates,
    phaseGateCommands
  };
}

function printNext(result) {
  if (!result.next) {
    console.log("没有找到未完成工作流。");
    return;
  }

  console.log(`下一工作流: ${result.next.id} ${result.next.title}`);
  console.log(`原因: ${result.next.reason}`);

  if (result.next.goals.length) {
    console.log("\n目标:");
    for (const goal of result.next.goals) {
      console.log(`- ${goal}`);
    }
  }

  if (result.next.files.length) {
    console.log("\n主要文件:");
    for (const file of result.next.files) {
      console.log(`- ${file}`);
    }
  }

  if (result.next.openTasks.length) {
    console.log("\n未完成子任务:");
    for (const task of result.next.openTasks) {
      console.log(`- ${task}`);
    }
  }

  if (result.next.validationCommands.length) {
    console.log("\n建议自动检查:");
    for (const command of result.next.validationCommands) {
      console.log(`- ${command}`);
    }
  }

  if (result.next.manualChecks.length) {
    console.log("\n建议人工/工具验证:");
    for (const check of result.next.manualChecks) {
      console.log(`- ${check}`);
    }
  }

  console.log("\n回写文档:");
  for (const file of result.next.writebacks) {
    console.log(`- ${file}`);
  }

  if (result.phaseGates.length) {
    console.log("\n并行阶段门禁:");
    for (const phase of result.phaseGates) {
      console.log(`- Phase ${phase.id} ${phase.title}`);
      for (const task of phase.openTasks) {
        console.log(`  - [${task.status}] ${task.text}`);
      }
    }
  }
}

function printList(result) {
  const markdown = readExecutionTasks();
  const workstreams = extractWorkstreams(markdown);

  for (const workstream of workstreams) {
    const doneCount = workstream.tasks.filter((task) => task.done).length;
    const totalCount = workstream.tasks.length;
    const status = workstream.openTasks.length ? "OPEN" : "DONE";
    console.log(`${workstream.id} ${status} ${doneCount}/${totalCount} ${workstream.title}`);
  }
}

const args = process.argv.slice(2);
const command = args[0] || "next";
const asJson = args.includes("--json");
const result = buildOutput();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "list") {
  printList(result);
  process.exit(0);
}

printNext(result);
