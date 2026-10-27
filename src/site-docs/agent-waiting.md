---
title: See which coding agent is waiting on you
summary: phux records a state on each pane that is running a coding agent. The state blocked means that pane is waiting on you.
description: See which phux pane is running a coding agent that is waiting on you, and wait until one is.
---

```sh
phux agent list
phux agent wait --any --until blocked --timeout 600
```

`phux agent list` prints one line per pane: the agent's kind, its address, and its state. `--json` prints the same facts as a document. The states are `working`, `blocked`, `idle`, `done`, and `unknown`. What each state means, and the order of evidence phux uses, is the table on [Coding agents](/agents#agent-states).

`blocked` is a permission prompt or a question. Screen rules ship for Claude Code, Codex, OpenCode, Aider, and the other programs named on that page. A screen that matches no rule reads as `idle`, never `blocked`.

`phux agent wait` returns when an agent moves into the state you name. It does not succeed because the agent is already in that state. An agent that is already `blocked` when the wait starts times out with exit 124. Read the current state with `phux agent list` or `phux agent show @7`.

`--any` waits for the first matching transition from any local agent. Omit it and pass one pane (`%reviewer` or `@7`) to wait on that pane. `--until` defaults to `idle`, `blocked`, and `done` together. Pass `--until blocked` to wait only for an agent that needs you, or repeat the flag to name more than one state. With no `--timeout` the wait runs until a transition. Pass a timeout in a script. `--json` prints a document instead of a line.

In the terminal UI, <kbd>C-a</kbd> <kbd>q</kbd> jumps to the next pane whose agent is waiting. <kbd>C-a</kbd> <kbd>Q</kbd> jumps back.

On another machine, SSH in and run the same commands there, or attach after you add the machine. [Remote machines](/remote).

## Next

- [Coding agents](/agents)
- [Run a command in a pane](/pane-command)
