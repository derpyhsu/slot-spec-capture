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

## Must record

Win presentation and buy feature are part of the spec. Fill them, or list the gap in `openQuestions`. Do not leave them as a button name.

- **Buy feature** (`core.buyFeature`): `{available, costX, target, options?}`. If a buy control exists, open it and read every package (name, cost in bet multiples, what it starts). Close the panel. Do not confirm a purchase. Screenshot image-only panels and transcribe them.
- **Free game** (`core.freeGame`): `{trigger, initialSpins, retrigger, multiplier}` from the rules. If one starts during the spin run, add timelines for the trigger show and one free spin. Do not buy a free game to force it.
- **Win presentation** (`presentation.winShow` and `presentation.timelines`): `spinMs` and `reelStop` from a no-win spin. For at least one winning spin, a timeline from the spin press: reel stop, line or symbol highlight, win animation, marquee or count-up, balance roll. Name big-win tiers (`big` / `mega` / `super`, threshold in bet multiples) only when the rules or a spin shows them. One timeline per distinct show. Node names support the timeline; they do not replace the sequence.
- **Feature cues**: each special mechanic gets `presentation.featureCues` when the probe sees its nodes, anims, or sfx.

## Steps

1. Open the URL with `new_page`, then wait until `cc.director.getScene()` is the game scene. If a start/splash screen is shown, take one low-quality JPEG screenshot and tap its start button by coordinates.
2. Load the probe: `evaluate_script` with `sourcePath: probe/capture.js` and `format: "script"`.
3. `__specCap.buttons()` lists visible buttons. Open the menu, then help/rules, with `__specCap.tap(name)`. Save `__specCap.rules()` to `specs/<gameId>/rules.txt`. If tapping by node name misses, take one screenshot and tap by coordinates. Page through free-game, buy-feature, and extra-bet sections. When those pages are images, screenshot and transcribe them into `core.freeGame`, `core.buyFeature`, and `features[]`.
4. Close the rules. If a buy control exists, open it, record the packages, and close it without paying.
5. Record presentation with `__specCap.run(30)`. Poll `__specCap.status()` (each poll can wait up to ~60 s in-page) until `end` is true. Then save `__specCap.events()` to `specs/<gameId>/events.json` and `__specCap.motion()` to `specs/<gameId>/motion.json`, then run `node probe/motion.js specs/<gameId>`. It measures reel scroll speed, stop stagger between reels, stop bounce, drop/refill duration and easing, and lists engine tween parameters. Read only its short console line and the top rows. Do not open motion.json.
6. Run `node probe/summarize.js specs/<gameId>`. Rare cues (nodes or anims seen in only some spins) are where special mechanics and win shows appear. Write one `presentation.timelines` entry per distinct show, including at least one winning spin.
7. Write `specs/<gameId>/spec.json` per the schema: core fields, `features[]` for special mechanics named as the rules name them, and `presentation`.
8. Run `node report/build.js specs/<gameId>`. It writes `spec.md` (rules spec) and `feel.md` (presentation and motion, from `spec.json` `presentation` and `motion-summary.json`). Do not hand-write either.

## Known limits

- Rules shown as images are not read by the probe. Screenshot and transcribe free-game, buy-feature, extra-bet, and win-tier pages. List only the still-unreadable parts in `openQuestions`.
- Spine and audio hooks may record nothing on some Cocos 3.x builds. Node show/hide still gives the order and timing.
- Events do not record grid position yet.
- Cocos Creator only. If `window.cc` is missing, stop and tell the user the game is not supported.
