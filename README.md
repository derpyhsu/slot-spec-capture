# slot-spec-capture

Capture the spec of an HTML5 slot as raw JSON, from its rules page and play. The raw spec is later mapped onto SDD spec templates.

- `schema/spec.schema.json`: v0 draft. Core fields are fixed. Special mechanics go to `features[]`. Each value records its source: `rules`, `observed`, `clientConfig`, `inferred`, or `unknown`.
- `specs/<gameId>/`: `rules.txt` holds the rules page text, and `spec.json` holds the raw spec. These files are **gitignored** because captured data stays out of this repo.

Human-readable copy: `node report/build.js specs/<gameId>` writes `spec.md` from `spec.json`. It only formats what `spec.json` says.

Probe (Cocos Creator 2.x / 3.x)
- `probe/capture.js`: load it with `evaluate_script` (`sourcePath`, `format: "script"`). It exposes `window.__specCap`:
  - `tap(nodeName)` taps a node through the canvas.
  - `rules()` returns the help text.
  - `run(n)` / `status()` run fire-and-forget spins and record presentation events (node show/hide, Spine/clip anims, sfx, label changes).
  - `events()` returns the recorded events. Save them to `specs/<gameId>/events.json`.
- `node probe/summarize.js specs/<gameId>` writes `presentation.json`: spin times, plus rare cues (nodes and anims that appear only in some spins). Rare cues are where special mechanics show up.
- Rules shown as images are invisible to the probe. Screenshot and transcribe free-game, buy-feature, and win-tier pages; list only the unread parts in `openQuestions`.
- Buy-feature panels are read and closed. Do not confirm a purchase.

Rules
- Read the rules page. Skip bet history.
- Do not change the bet. Never store URL query strings or session tokens.
- Unknown stays `unknown`. Do not guess. Record contradictions in `conflicts`.
- After every few games, promote recurring `features[]` to core fields and drop core fields nobody fills.
