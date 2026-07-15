#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  recitationWxml: path.join(root, "pages/recitation/index.wxml"),
  recitationWxss: path.join(root, "pages/recitation/index.wxss"),
  recitationJs: path.join(root, "pages/recitation/index.js"),
  mapping: path.join(root, "docs/ui-parity/recitation.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/recitation.tokens.json")
};

function readFile(file) {
  return fs.readFileSync(file, "utf8");
}

function loadJson(file) {
  return JSON.parse(readFile(file));
}

function includesEvery(content, values) {
  return values.every((value) => content.includes(value));
}

const REQUIRED_MAPPING_IDS = [
  "recitation.topbar",
  "recitation.hero-card",
  "recitation.stats-strip",
  "recitation.lines",
  "recitation.note-card",
  "recitation.full-text-view",
  "recitation.round-adjustment",
  "recitation.completion-record",
  "recitation.no-playback"
];

const PLAYBACK_RULES = [
  { id: "audio-element", pattern: /<\s*audio(?:\s|>)/i },
  { id: "wx-create-inner-audio-context", pattern: /\bwx\s*\.\s*createInnerAudioContext\s*\(/i },
  { id: "wx-background-audio-manager", pattern: /\bwx\s*\.\s*getBackgroundAudioManager\s*\(/i },
  { id: "wx-create-web-audio-context", pattern: /\bwx\s*\.\s*createWebAudioContext\s*\(/i },
  { id: "audio-context-identifier", pattern: /\baudio[_-]?context\b/i },
  { id: "playback-method-call", pattern: /\b(?:play|pause|stop|seek)\s*\(/i },
  {
    id: "audio-event-method-call",
    pattern: /\.\s*(?:on|off)(?:play|pause|stop|timeupdate|ended|error|waiting|seeking|seeked|canplay)\s*\(/i
  },
  {
    id: "audio-event-binding",
    pattern: /\b(?:bind|catch):?(?:timeupdate|play|pause|ended|waiting|seeking|seeked|canplay)\s*=/i
  },
  {
    id: "playback-control-binding",
    pattern: /\b(?:bind|catch):?(?:tap|change)\s*=\s*["'][^"']*(?:play|pause|stop|seek|audio)[^"']*["']/i
  },
  {
    id: "playback-data-action",
    pattern: /\bdata-(?:action|command)\s*=\s*["'](?:play|pause|stop|seek)["']/i
  },
  { id: "playback-control-class", pattern: /\b(?:time-row|progress-slider|control-row|control-play)\b/i },
  { id: "playback-timer-symbol", pattern: /\b(?:syncPlaybackView|startPlaybackTicker|playbackTimer)\b/i }
];

export const PLAYBACK_NEGATIVE_FIXTURES = Object.freeze([
  {
    id: "inner-audio-context",
    expectedRuleId: "wx-create-inner-audio-context",
    source: "const player = wx.createInnerAudioContext();"
  },
  {
    id: "inner-audio-context-uppercase",
    expectedRuleId: "wx-create-inner-audio-context",
    source: "const player = WX.CREATEINNERAUDIOCONTEXT();"
  },
  {
    id: "background-audio-manager",
    expectedRuleId: "wx-background-audio-manager",
    source: "const player = wx.getBackgroundAudioManager();"
  },
  {
    id: "web-audio-context",
    expectedRuleId: "wx-create-web-audio-context",
    source: "const graph = wx.createWebAudioContext();"
  },
  {
    id: "audio-context-identifier",
    expectedRuleId: "audio-context-identifier",
    source: "let audioContext = null;"
  },
  { id: "audio-element", expectedRuleId: "audio-element", source: "<audio src=\"{{audioUrl}}\"></audio>" },
  { id: "play-call", expectedRuleId: "playback-method-call", source: "player.play();" },
  { id: "pause-call", expectedRuleId: "playback-method-call", source: "player.pause();" },
  { id: "stop-call", expectedRuleId: "playback-method-call", source: "player.stop();" },
  { id: "seek-call", expectedRuleId: "playback-method-call", source: "player.seek(12);" },
  {
    id: "timeupdate-event-method",
    expectedRuleId: "audio-event-method-call",
    source: "player.onTimeUpdate(syncProgress);"
  },
  {
    id: "play-event-method",
    expectedRuleId: "audio-event-method-call",
    source: "player.onPlay(handlePlay);"
  },
  {
    id: "timeupdate-event-binding",
    expectedRuleId: "audio-event-binding",
    source: "<video bindtimeupdate=\"onTimeUpdate\"></video>"
  },
  {
    id: "colon-timeupdate-event-binding",
    expectedRuleId: "audio-event-binding",
    source: "<video bind:timeupdate=\"onTimeUpdate\"></video>"
  },
  {
    id: "play-control-binding",
    expectedRuleId: "playback-control-binding",
    source: "<button bindtap=\"togglePlayback\">开始</button>"
  },
  {
    id: "colon-play-control-binding",
    expectedRuleId: "playback-control-binding",
    source: "<button bind:tap=\"togglePlayback\">开始</button>"
  },
  {
    id: "seek-control-binding",
    expectedRuleId: "playback-control-binding",
    source: "<slider bindchange=\"seekAudio\" />"
  },
  {
    id: "playback-data-action",
    expectedRuleId: "playback-data-action",
    source: "<button data-action=\"play\">开始</button>"
  },
  {
    id: "playback-control-class",
    expectedRuleId: "playback-control-class",
    source: "<button class=\"control-play\">开始</button>"
  },
  {
    id: "playback-timer",
    expectedRuleId: "playback-timer-symbol",
    source: "startPlaybackTicker();"
  }
]);

export function detectPlaybackViolations(sources = {}) {
  const violations = [];
  Object.entries(sources).forEach(([sourceId, content]) => {
    if (typeof content !== "string") return;
    PLAYBACK_RULES.forEach((rule) => {
      const match = content.match(rule.pattern);
      if (!match) return;
      violations.push({ sourceId, ruleId: rule.id, match: match[0] });
    });
  });
  return violations;
}

export function runPlaybackGateSelfCheck() {
  const failedFixtureIds = PLAYBACK_NEGATIVE_FIXTURES
    .filter((fixture) => !detectPlaybackViolations({ fixture: fixture.source })
      .some((violation) => violation.ruleId === fixture.expectedRuleId))
    .map((fixture) => fixture.id);
  return {
    passed: failedFixtureIds.length === 0,
    failedFixtureIds
  };
}

function hasRequiredMappings(mapping) {
  const ids = new Set((mapping.mappings || []).map((item) => item.id));
  return REQUIRED_MAPPING_IDS.every((id) => ids.has(id));
}

export function runChecks() {
  const mapping = loadJson(files.mapping);
  const tokens = loadJson(files.tokens);
  const designApp = readFile(files.designApp);
  const recitationWxml = readFile(files.recitationWxml);
  const recitationWxss = readFile(files.recitationWxss);
  const recitationJs = readFile(files.recitationJs);
  const recitationSources = {
    js: recitationJs,
    wxml: recitationWxml,
    wxss: recitationWxss
  };
  const playbackGateSelfCheck = runPlaybackGateSelfCheck();

  const checks = [
    {
      id: "config.mapping-covers-manual-recitation",
      check: () => (
        mapping.meta?.interactionMode === "manual-completion-no-playback"
        && hasRequiredMappings(mapping)
      )
    },
    {
      id: "config.tokens-cover-manual-actions",
      check: () => (
        tokens.meta?.interactionMode === "manual-completion-no-playback"
        && includesEvery(Object.keys(tokens.selectorSnapshot || {}), [
          ".hero-card",
          ".stats-strip",
          ".segment-card",
          ".note-card",
          ".round-inline",
          ".round-inline-btn",
          ".complete-button"
        ])
      )
    },
    {
      id: "guard.no-playback-negative-fixtures",
      check: () => playbackGateSelfCheck.passed
    },
    {
      id: "logic.no-playback-entry",
      check: () => detectPlaybackViolations(recitationSources).length === 0
    },
    {
      id: "logic.practice-tip-and-daily-progress",
      check: () => /buildPracticeTip/.test(recitationJs) && /buildDailySegmentText/.test(recitationJs)
    },
    {
      id: "logic.round-adjustment",
      check: () => /increaseRound/.test(recitationJs) && /decreaseRound/.test(recitationJs)
    },
    {
      id: "logic.completion-record-path",
      check: () => (
        /completeRecitationWithFallback/.test(recitationJs)
        && /roundCount/.test(recitationJs)
        && /durationSeconds/.test(recitationJs)
      )
    },
    {
      id: "structure.topbar-and-hero",
      check: () => includesEvery(recitationWxml, [
        "header-topbar",
        "hero-card",
        "heart-button"
      ])
    },
    {
      id: "structure.stats-and-lines",
      check: () => includesEvery(recitationWxml, [
        "stats-strip",
        "segment-head",
        "class=\"segment-card card"
      ])
    },
    {
      id: "structure.note-card",
      check: () => includesEvery(recitationWxml, [
        "note-card",
        "note-title",
        "practiceTip"
      ])
    },
    {
      id: "structure.round-adjustment-and-completion",
      check: () => includesEvery(recitationWxml, [
        "round-inline",
        "bindtap=\"decreaseRound\"",
        "bindtap=\"increaseRound\"",
        "complete-button"
      ])
    },
    {
      id: "design-source.fulltext-modal",
      check: () => designApp.includes("经文全文") && designApp.includes("修持要点")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => recitationWxss.includes(`${selector} {`) && includesEvery(recitationWxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Recitation parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-recitation-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runChecks();
}
