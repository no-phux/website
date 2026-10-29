---
title: Know when Claude Code or Codex is waiting for you
summary: phux agent list prints each pane's agent state, and blocked means Claude Code, Codex, or another recognized agent is waiting on you. phux agent wait --any --until blocked returns when the next one starts waiting.
description: See which pane's coding agent is blocked on you, and wait until one is.
---

```sh
phux agent list
phux agent wait --any --until blocked --timeout 600
```

`phux agent list` prints one line per pane: the agent's kind, its address, and its state. `--json` prints the same facts as a document. The states are `working`, `blocked`, `idle`, `done`, and `unknown`. What each state means, and the order of evidence phux uses, is the table on [Coding agents](/agents#agent-states).

`blocked` is a permission prompt or a question. Screen rules ship for Claude Code, Codex, OpenCode, Aider, and the other programs named on that page. fx is identified by its executable, but its screen has no verified state rules yet; use the built-in `fx acp` profile for structured state. A screen that matches no rule reads as `idle`, never `blocked`.

`phux agent wait` returns when an agent moves into the state you name. It does not succeed because the agent is already in that state. An agent that is already `blocked` when the wait starts times out with exit 124. Read the current state with `phux agent list` or `phux agent show @7`.

`--any` waits for the first matching transition from any local agent. Omit it and pass one pane (`%reviewer` or `@7`) to wait on that pane. `--until` defaults to `idle`, `blocked`, and `done` together. Pass `--until blocked` to wait only for an agent that needs you, or repeat the flag to name more than one state. With no `--timeout` the wait runs until a transition. Pass a timeout in a script. `--json` prints a document instead of a line.

## Many agents at once

`phux agent list --json` prints every pane's agent and state as one document. `phux agent wait --any` (above) waits on all of them. `phux wait` and `phux watch` take one pane: `--until TEXT` returns when a line contains TEXT, `--idle MS` when output holds still, and `phux watch --json` prints that pane's events one per line.

```sh
phux agent list --json
phux wait --until "BUILD SUCCESSFUL" work
phux wait --idle 750 repl
phux watch --json work:1.0
```

Flags are in the [command reference](/reference/cli).

In the terminal UI, <kbd>C-a</kbd> <kbd>q</kbd> jumps to the next pane whose agent is waiting. <kbd>C-a</kbd> <kbd>Q</kbd> jumps back.

On another machine, SSH in and run the same commands there, or attach after you add the machine. [Remote machines](/remote).

## Next

- [Coding agents](/agents)
- [Run a command in a pane](/pane-command)
