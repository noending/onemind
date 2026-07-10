# Miniapp Scientific Memory Training Design

## Goal

Improve the miniapp practice flow so scientific memorization feels credible, readable, and easy to operate on a phone screen.

## Confirmed Direction

Use方案 B: keep the current devotional visual language, but tighten the practice page hierarchy and fix the memorization loop.

## Scientific Memory Requirements

- Keep the existing active-recall sequence: follow reading, first-character cue, covered recall, fill-in recall, feedback.
- Short chants should not complete after a single successful session. They should keep at least four review nodes so spacing still matters.
- A strong feedback action should raise mastery but should only complete the whole plan on the final scheduled task.
- Keep the current three feedback choices: needs work, stronger, mastered.
- The page should explain why the current segment is due, but the explanation must not crowd out the practice content.

## UI Requirements

- The header should take roughly the top third of the viewport, not the majority of the first screen.
- The first viewport should expose practice content quickly, preferably two or more practice cards for short content.
- Title size should be reduced from the current oversized state while retaining the Songti-style devotional tone.
- Pinyin should stay directly above the matching character and remain legible.
- Primary navigation buttons should stay near the thumb area, using a sticky bottom action bar.
- The primary button should be visually dominant; the secondary button should be quieter.
- The audio control should not dominate each segment card.

## Files

- `common/content.js`: set practical short-chant review durations.
- `common/memory.js`: prevent early plan completion before the final task.
- `pages/practice/index.js`: expose UI state for safer step advancement and feedback progress.
- `pages/practice/index.wxml`: compact the header and move step actions into a sticky action bar.
- `pages/practice/index.wxss`: rebalance spacing, font sizes, card proportions, and button placement.

## Validation

- Run JavaScript syntax checks.
- Run pinyin-to-character alignment checks.
- Run the existing library parity check.
- If the correct `oneMind` project is open in WeChat DevTools, visually confirm the practice page.
