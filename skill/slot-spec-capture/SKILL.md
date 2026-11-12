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

`spec.json` is the source of truth. `spec.md` and `feel.md` are generated for people. In every field, `null` means not measurable and `"none"` means observed absent. Keep observed and inferred apart (`presentation.observations[].kind`).

Rules (`core`):
- **Symbols**: one row per symbol in `core.symbols`: name, role (wild / scatter / multiplier / normal), and pays. Take the pairing from `helpDump()`, where each symbol sprite sits next to its own pay labels. Map backend ids from winning lines in `net.json` (pay = pay3 × bet unit).
- **Lines**: `core.lines`, the row index per reel (0 = top) for every line, and whether a special reel is on the lines. Export the line diagram with `exportSprites` and read it.
- **Free game, buy feature, extra bet**: trigger, initial spins, retrigger, package costs and contents, and what extra bet improves. Open the buy panel and close it without paying. If a rules section shows untranslated keys or images, say so in `conflicts`.
- **Special mechanics** (multiplier reel, split, and so on): values, whether they differ in the free game, what they multiply (line or total win), and how the backend encodes them (from `net.json`).

Feel (`presentation`), player-facing, no node names:
- Distances in grid cells, with the cell height in px and the design resolution.
- For each speed mode (normal / turbo / super, or however many the game has): spin start (together or gap in ms), scroll speed in cells per second, stop gap per reel, deceleration in ms, and bounce (none, or cells and ms).
- Quick stop (tap Spin again mid-spin) for each speed mode.
- Anticipation: which reel starts it, the direction, the extra wait in ms, and the slowed speed. If it does not occur, write that it was not seen.
- Win sequence in generic stages, timed from the Spin press: reels stopped → special-feature show → line highlight → win shown → count-up → balance → next spin enabled.
- Big win: threshold in bet multiples and the duration of each stage, or not seen.
- Visual changes from toggles such as extra bet: one screenshot with the toggle on and one with it off, described in words. Turn the toggle off again and do not spin with it on.

## Steps

1. Open the lobby or URL. Once on the game page, reload it with `navigate_page` `type: "reload"` and `initScript` set to the content of `probe/net-init.js`. That records the backend traffic in `window.__net`. Wait for the game scene. If a start screen shows, take one low-quality screenshot. It often shows volatility and max win. Then tap its start button.
2. Load the probe with `evaluate_script`, `sourcePath: probe/capture.js`, and `format: "script"`.
3. Open the menu, then help. Save `__specCap.helpDump()` to `specs/<gameId>/help.txt` and `__specCap.rules()` to `rules.txt`. Run `__specCap.exportSprites(/line|PayTable|FreeGame|BuyFreeGame|ExtraBet/i)`, save the result, and decode the PNGs into `img/`. Read only the images you need, such as the line diagram.
4. Close the help. Open the buy panel if one exists, then close it. Toggle extra bet on and take a screenshot, then toggle it off and take a screenshot. Check that the bet label is back to its original value.
5. Run spins in each speed mode: `setLabel(mode)`, `run(10)`, then tap the speed toggle. After that, run quick stops for each mode with `setLabel(mode)` and `quick(4)`. Poll `status()`, never longer than 60 s per call.
6. Save `events()`, `motion()`, `window.__net`, and `meta()` to `events.json`, `motion.json`, `net.json`, and `meta.json`.
7. Write `spec.json`, then run `node probe/reels.js specs/<gameId>`. It merges `presentation.measured`: cells, speed modes, quick stop, anticipation, and win sequence. Read only its console line.
8. Run `node report/build.js specs/<gameId>` to write `spec.md` and `feel.md`. Do not hand-write either.

## Known limits

- Rules shown as images are not read by the probe. Screenshot and transcribe free-game, buy-feature, extra-bet, and win-tier pages. List only the still-unreadable parts in `openQuestions`.
- Spine and audio hooks may record nothing on some Cocos 3.x builds. Node show/hide still gives the order and timing.
- In turbo modes that finish in under about 0.75 s, a quick-stop tap may land after the reels have stopped. Record that as not measurable.
- `net.json` may hold session data. It stays under the gitignored `specs/`, and only its structure goes into the spec.
- Cocos Creator only. If `window.cc` is missing, stop and tell the user the game is not supported.
