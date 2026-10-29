---
title: Run a command in a pane and get its output and exit code
summary: phux run types a command into a pane's shell, waits until it finishes, and exits with that command's status. From tmux: send-keys, capture-pane -p, and kill-pane map to phux send-keys, phux snapshot, and phux kill.
description: Map tmux send-keys, capture-pane, and kill-pane to phux, then run a command and read its exit code.
---

```sh
phux run --timeout 300 @7 'cargo test'
phux snapshot --json @7
```

`phux run` types the command into the pane's shell, waits until it finishes, and prints the output. The process exits with the command's own status. The text view ends with a line such as `exit=0 (155ms)`. `--json` prints a document instead of that text. `--timeout` is one budget for the whole run, including connecting, and defaults to 600 seconds. `0` waits without a limit. A run that hits the timeout exits 125. Giving up does not stop the command. Flags (`--timeout`, `--force`, `--json`) go before the target. Anything after the target is the command.

## Coming from tmux

| tmux | phux |
| --- | --- |
| `send-keys` | `phux send-keys` sends named keys (`Enter`, `C-c`) or literal text to one pane. |
| `capture-pane -p` | `phux snapshot` reads that pane's screen as text, or as JSON with `--json`. |
| `kill-pane` | `phux kill` kills a pane, a group, or a session. On a terminal it asks first; without a terminal it refuses unless you pass `--yes`. |
| `kill-server` | `phux kill --server` stops the server. |

`phux send-keys` is tmux-shaped: flags go before the target, and everything after the target is a key. [Getting started](/getting-started#coming-from-tmux) has more tmux pairings. The other flags are in the [command reference](/reference/cli).

`run` refuses with exit 2 when the foreground program is not a POSIX shell (`sh`, `bash`, or `zsh`). In `vim` or `less` those bytes would be keystrokes. `--force` skips that check. Do not use `run` to type into a coding agent that is already in the foreground.

`phux snapshot` prints the screen. It does not attach, resize, or change the pane. `--json` includes the lines, cursor, size, and title.

`phux wait` polls until a line matches. It exits 0 on a match and 124 when `--timeout` runs out. With no `--timeout` it waits without a limit. `0` checks once. `--until` matches any line, including the command you just typed. `--output-only` ignores lines the shell marked as input, which needs a shell with OSC 133. Use it for output `run` doesn't wait on, such as a dev server: `phux wait --regex 'Listening on' --timeout 60 @7`.

`@7` is a pane that exists now. `phux new --json -s work` creates a session without attaching and prints the seed pane's id. `--json` requires `-s`.

The other flags are in [Driving terminals from scripts](/scripting).

## Next

- [Driving terminals from scripts](/scripting)
- [Know when Claude Code or Codex is waiting for you](/agent-waiting)
