# 3JSE Canonical Agent Instructions

This repository is an agent-native Three.js/WebGPU game-development harness.

## Mandatory route for broad game tasks

For any request to create, upgrade, finish, polish, debug, or extend a game:

1. Read `.agents/skills/3jse-director/SKILL.md`.
2. Resolve requested capabilities with `.agents/skills/capability-resolver/SKILL.md`.
3. Route each capability through `.agents/skills/vendor-router/SKILL.md`.
4. Search existing project code/assets before introducing a new dependency or primitive.
5. Use the appropriate provider skill(s).
6. Build a playable vertical slice before broad content production.
7. Run gameplay, visual, runtime-error, and performance verification before claiming completion.

## Non-negotiable rules

- Static scene != game.
- Existing working systems outrank prose descriptions.
- Existing licensed assets outrank generated placeholder models.
- Named providers outrank generic primitives when they satisfy the capability.
- Never silently replace a proven provider with a simpler reimplementation.
- Never remove a provider or an optimization to make something work — fix the consumer whose assumption did not hold. Dropping a rung of the reuse ladder ships the cost to hide a bug that is still there, and the next asset copies the removal.
- Do not execute unknown downloaded binaries.
- Unknown repositories are inspection-only until they pass source, dependency, license, and script review.
- Do not run package lifecycle scripts from untrusted repositories during intake.
- Preserve attribution/provenance for external assets and code.
- Keep gameplay state outside the scene graph when practical.
- Prefer deterministic simulations and deterministic tests.
- Do not claim AAA/premium/complete without fresh evidence.

## Agent operating rules

Rules that govern *how* an agent works in this tree. Each carries the reason it exists. Several are adopted from the [vibe game engine web-starter-kit](https://github.com/vibegameengine/web-starter-kit) (MIT), where they were distilled from measured incidents in a production browser game; their mechanism transfers, their game-specific names do not.

**Commit early, on a branch.** As soon as a coherent piece compiles and does something, commit it — do not wait to be asked, and never straight to `main`. Uncommitted work has no history and no diff: when another session edits the same file underneath you, the question "what broke it" has no baseline to answer with. Measured in the source kit: six files of a navigation system sat untracked for three hours while another session edited one of them; for twenty minutes the tree did not compile and nobody could say what changed.

**Never delete work wholesale.** No deleting files, removing code wholesale, or `npm uninstall` without explicit permission — preserve the work (keep in place or save to a branch). Revert by writing the reverse edit, never by asking git to discard whatever happens to be there. The opt-in guard `.claude/hooks/block-destructive-git.mjs` (wired via `.claude/settings.example.json`) refuses the destructive family — `checkout` without `-b`, `restore`, `clean`, `stash`, `reset --hard`, `switch --force`, `worktree remove` — and lets their harmless forms through. Its incident: `git checkout -- <file>` undone one change and silently discarded every other uncommitted edit in that file.

**The bench is not evidence.** Verification captures — screenshots, temporary renders, debug probes, active handoff notes — live in the git-ignored `wip/`, never in `docs/`, source directories, or commits. The *script* that produced a measurement is a tool, and tools are committed to `scripts/`. Test: if losing the artifact would make a recorded number unrepeatable, it is a tool.

**Do not stop to ask a question you could answer yourself.** Not knowing something is the work, not a reason to hand the decision back. Decide, state the decision plainly in the report, and make it reversible where you can. The bar for actually stopping is narrow: destructive, outward-facing, or irreversible. Asking twice for the same thing is the tell — an unanswered question is an answer: decide it.

**Write down what a future agent would want to know — as you go, not at the end.** Product lessons (how *these* systems behave) go to the game project's own `docs/`; harness lessons (holding in any project with the same technique) go to this harness's `docs/` and travel to everything started from it. Label a portable lesson as portable when you write it. Write the falsified ones too, with the number that falsified them: a recorded dead end is worth more than a recorded success, because the dead end gets retried by every agent after you.

**Never explain the code in a comment.** Prose that restates code is noise with a maintenance cost — delete it, or move a paragraph of rationale to `docs/` leaving one pointer line. Keep, unshortened, what the code cannot say: a measurement (`// Measured: 125 Hz against 120 fps gives alpha 1.04`), a source citation, or a dead-end marker. A name is the cheapest comment: try extracting a function whose name says what the comment was going to say. The optional guard `.claude/hooks/clean-code-guard.mjs` is a ratchet — it reports a file that got *worse* than `.claude/clean-code-baseline.json` records, never the debt already there; length is what it blocks on, comment volume it warns about.

**Never write Markdown through a shell script.** No heredoc, no `cat >`, no `echo`, no Python assembling prose — use the Write/Edit tool, once. Shell quoting is wrong on the first attempt, the failure arrives after the whole document has been sent, and the document is then sent again. A script remains right for surgical code edits; it is wrong the moment the payload is a paragraph.

**Compress the channel nobody reads; never the one the user reads.** Internal traffic — reasoning, sub-agent briefs, handoffs — drops articles, filler, pleasantries and narration; fragments are fine. Every reply a user reads is normal prose. Never compress what must survive verbatim: code, file paths, exact error strings, API and CLI names, numbers, units, and `not`/`never`/`only`/`except`. Persisted artifacts — commits, docs, `wip/` notes — are the user's channel.

**Read the code before reaching for a frame.** Frames are proof that something works, never an instrument for finding out why it does not. A fault is found in the code: grep who already does the thing, open the file, read the arithmetic, reason the mechanism — then confirm with one frame. Measured in the source kit: an hour lost probing and capturing when one `grep -rn` for the component's name would have answered it.

**Measure systems in a lab, never in a playable scene.** A playable scene measures integration only — it has a live player, a spawner that drip-feeds, overlapping waves, and a moving camera, each a variable the measurement did not declare. Any claim about how a system *behaves* is measured on an isolated bench: chosen geometry, a fixed cast, the same numbers every run. If the question is "does this work", build the lab; if the question is "do these fit together in the real product", the scene is right and the answer is a frame, not a statistic.

**Visual verification is headed, or it did not happen.** No headless/software-GL frames as visual evidence, for any reason — headless results mislead and must never ground a "looks right" claim. A real visible window (the user's browser, or Playwright with `headless: false` against a normal dev server) is the check. A typecheck or build is not visual verification.

**What the user says is a fact until proven otherwise.** "The sky is gone", "there are two geometries", "the world is offset" — that is a report from the person looking at the running game. Take it as given and go find the cause; do not spend a turn re-confirming the symptom. Contradicting it needs evidence, not doubt: if the code says otherwise, say which line and why.

## Canonical directories

- `.agents/skills/` — canonical skill source
- `.agents/registry/` — provider/capability/mechanic/security registries
- `.agents/recipes/` — reusable game archetypes
- `.agents/hooks/` — deterministic quality gates
- `.claude/skills/` — Claude Code mirror/adapter
- `.claude/hooks/` — Claude Code guard hooks (destructive-git, clean-code); opt-in via `.claude/settings.example.json`
- `evidence/` — reports, screenshots, metrics, playtest notes
- `wip/` — git-ignored local bench: verification captures, probes, handoff notes

## Completion evidence

A broad game task is not complete until the evidence report records:

- playable loop exercised
- build/typecheck status
- console/runtime errors
- gameplay test result
- screenshots or visual inspection result
- frame-rate / draw-call / memory observations where relevant
- external asset/provider ledger
- known limitations

## Attribution

The destructive-git and clean-code guard hooks, the WIP-workspace rule, and the operating rules above marked as such are adopted from the [vibe game engine web-starter-kit](https://github.com/vibegameengine/web-starter-kit) (MIT License). Their mechanisms are kept intact; their project-specific names and numbers are not imported.
