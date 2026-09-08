# WIP — local working bench (git-ignored)

This directory is the agent's scratch space. Everything in it is local: it does not
travel with commits, and future agents do not read it except through the notes below.

What belongs here:

- verification screenshots and captures — a frame that proves something worked
- temporary renders, debug probes, exported test assets
- active handoff notes for an in-flight task

What never belongs here:

- any file a committed file depends on
- the SCRIPT that produced a measurement — that is a tool, and tools are committed to `scripts/`
- finished lessons — those go to the project's `docs/` (product lessons) or the harness `docs/` (portable lessons)

Conventions:

- one subdirectory per task: `wip/<task-name>/`
- keep the task notes accurate while the task is open
- when the evidence report is committed, clean the task's folder — or leave a note saying what is still needed

The rule this implements: **the bench is not evidence.** A number recorded in a committed
document must be reproducible from committed tools. If losing `wip/` would make a recorded
measurement unrepeatable, the tool that produced it belongs in `scripts/`.

Adopted from the vibe game engine web-starter-kit (MIT).
