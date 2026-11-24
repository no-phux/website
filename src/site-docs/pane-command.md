---
title: Run a command in a tmux pane and get its output and exit code
summary: tmux send-keys runs a command in a pane, wait-for returns when that command signals, and capture-pane prints the screen, including an exit-code marker the command prints. phux run types the command, waits until it finishes, prints the output, and exits with that command's status.
description: Run a command in a tmux pane with send-keys, wait-for, and capture-pane. phux run prints the output and exits with the command's status.
---

`%0` is a pane id. `tmux list-panes -F '#{pane_id}'` prints the id of each pane in the current window.

```sh
tmux send-keys -t %0 'printf "hello\n"; printf "EXIT:%s\n" "$?"; tmux wait-for -S cmd-done' Enter
tmux wait-for cmd-done
tmux capture-pane -p -t %0
```

`send-keys` types the quoted text and then Enter, and the pane's shell runs that line. Single quotes leave `$?` for that shell, which expands it after `printf`.

`wait-for cmd-done` returns when the pane runs `wait-for -S cmd-done`. If the pane signals first, that signal is kept, so the wait still returns. `wait-for` itself exits 0, even when the marker is `EXIT:1`.

`capture-pane -p` prints the visible pane. For this command that pane contains `EXIT:0`; after `false` the marker is `EXIT:1`. Lines that have scrolled off are not in that print. `capture-pane -p -S -` starts at the beginning of the history.

`phux run` prints the output and exits with the command's status.

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

`run` drives sh, bash, zsh, and fish. It refuses with exit 2 when the program reading the pane is not a shell. In `vim` or `less` those bytes would be keystrokes. `--force` skips that check. Do not use `run` to type into a coding agent that is already in the foreground.

`phux snapshot` prints the screen. It does not attach, resize, or change the pane. `--json` includes the lines, cursor, size, and title.

`phux wait` polls until a line matches. It exits 0 on a match and 124 when `--timeout` runs out. With no `--timeout` it waits without a limit. `0` checks once. `--until` matches any line, including the command you just typed. `--output-only` ignores lines the shell marked as input, which needs a shell with OSC 133. Use it for output `run` doesn't wait on, such as a dev server: `phux wait --regex 'Listening on' --timeout 60 @7`.

`@7` is a pane that exists now. `phux new --json -s work` creates a session without attaching and prints the seed pane's id. `--json` requires `-s`.

The other flags are in [Driving terminals from scripts](/scripting).

## Next

- [Driving terminals from scripts](/scripting)
- [Know when Claude Code or Codex is waiting for you](/agent-waiting)
