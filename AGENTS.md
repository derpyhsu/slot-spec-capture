# slot-spec-capture

This repo records the spec of an HTML5 slot from the page: its rules page, its play, and how it presents. The game source is not required. A run is one game URL.

Before capturing, read `skill/slot-spec-capture/SKILL.md`, then `schema/spec.schema.json`.

## Boundaries

- Load the probe with `evaluate_script` `sourcePath: probe/capture.js`. Do not paste it.
- Spend as few tokens as possible. Do not echo the game URL. Save bulky output with `evaluate_script` `filePath`. Screenshot only when the rules are images or a state is unclear.
- Prefer the Chrome DevTools MCP server named `chrome-devtools`.
- Drive the canvas with pointer events. Do not call game-internal handlers.
- Do not change the bet. Read the rules page. Skip bet history.
- Never write URL query strings or session tokens into `specs/` or any file.
- Every value has a `source`. Unknown stays `unknown`. Do not guess.

## Output

Write `specs/<gameId>/` with `rules.txt`, `events.json`, `presentation.json`, and `spec.json`, then run `node report/build.js specs/<gameId>` to write `spec.md`. `specs/` is gitignored: captured data stays out of this repo.
