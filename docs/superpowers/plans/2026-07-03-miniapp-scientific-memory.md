# Miniapp Scientific Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the miniapp scientific memorization loop and practice-page UI proportions.

**Architecture:** Keep the existing local content and memory-plan architecture. Make small targeted changes to content defaults, plan completion rules, and the practice page view model/styles.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS JavaScript.

---

### Task 1: Scientific Memory Loop

**Files:**
- Modify: `common/content.js`
- Modify: `common/memory.js`

- [ ] Set short chants to at least four plan days where appropriate, preserving single-line segment display.
- [ ] Change local completion logic so `mastered` only completes the whole plan when the current task is the last scheduled task.
- [ ] Keep score increases for strong feedback, but continue the review schedule until final task.

### Task 2: Practice Page View Model

**Files:**
- Modify: `pages/practice/index.js`

- [ ] Add derived state for whether all segment cards have been revealed in the current step.
- [ ] Use that state to style or label the primary action without blocking emergency navigation.
- [ ] Keep existing navigation and recitation links intact.

### Task 3: Practice Page Layout

**Files:**
- Modify: `pages/practice/index.wxml`
- Modify: `pages/practice/index.wxss`

- [ ] Compact the header by reducing title, helper text, chip, and stage badge proportions.
- [ ] Keep practice content visible earlier on the first screen.
- [ ] Move previous/next controls into a sticky bottom action bar.
- [ ] Reduce segment audio button size and rebalance pinyin/text/card spacing.
- [ ] Make feedback buttons visually consistent with the new bottom action layout.

### Task 4: Validation

**Files:**
- No production file changes required.

- [ ] Run `node --check pages/practice/index.js`.
- [ ] Run `node --check common/memory.js`.
- [ ] Run `node --check common/content.js`.
- [ ] Run pinyin alignment script.
- [ ] Run `node tools/check-library-parity.mjs`.
