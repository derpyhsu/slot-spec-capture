---
name: slot-spec-capture
description: Capture the spec of an HTML5 slot (grid, ways/lines, drop or cascade, free game, buy feature, special mechanics, win presentation) from its rules page and play, as raw JSON plus a readable spec.md. Use when the user gives a slot URL and asks to 記錄規格, 競品規格, 抓規格, or reference another studio's game. Prefer Chrome DevTools MCP.
---

# slot-spec-capture

Record what one slot game is and how it presents. Do not modify the game. Do not judge whether the design is good.

## Read first

- [schema/spec.schema.json](../../schema/spec.schema.json)
- [README.md](../../README.md)

## Boundaries

- Spend as few tokens as possible. Do not echo the game URL. Avoid screenshots unless the rules are images or a state is unclear. Save bulky output to files with `evaluate_script` `filePath`.
- Drive the canvas with pointer events through `__specCap.tap`. Do not call game-internal handlers.
- Do not change the bet. Read the bet and balance on screen. Stop and tell the user if they cannot be read or the balance is short.
- Read the rules page. Skip bet history.
- Never write URL query strings or session tokens to any file.
- Every value has a `source`. Unknown stays `unknown`. Record contradictions in `conflicts`, and things you could not confirm in `openQuestions`.

## Steps

1. Open the URL with `new_page`, then wait until `cc.director.getScene()` is the game scene. If a start/splash screen is shown, take one low-quality JPEG screenshot and tap its start button by coordinates.
2. Load the probe: `evaluate_script` with `sourcePath: probe/capture.js` and `format: "script"`.
3. `__specCap.buttons()` lists visible buttons. Open the menu, then help/rules, with `__specCap.tap(name)`. Save `__specCap.rules()` to `specs/<gameId>/rules.txt`. If tapping by node name misses, take one screenshot and tap by coordinates.
4. Close the rules. Record presentation with `__specCap.run(30)`. Poll `__specCap.status()` (each poll can wait up to ~60 s in-page) until `end` is true. Then save `__specCap.events()` to `specs/<gameId>/events.json`.
5. Run `node probe/summarize.js specs/<gameId>`. Rare cues (nodes or anims seen in only some spins) are where special mechanics and win shows appear. For a spin with a rare cue, print its event sequence locally and write it as a `presentation.timelines` entry.
6. Write `specs/<gameId>/spec.json` per the schema: core fields, `features[]` for special mechanics named as the rules name them, and `presentation`.
7. Run `node report/build.js specs/<gameId>` to write `spec.md`. Do not hand-write `spec.md`.

## Known limits

- Rules shown as images are not read by the probe. List them in `openQuestions`, or screenshot those pages only if the user agrees.
- Spine and audio hooks may record nothing on some Cocos 3.x builds. Node show/hide still gives the order and timing.
- Events do not record grid position yet.
