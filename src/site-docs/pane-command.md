---
title: Run a command in a pane and get its output and exit code
summary: phux run types a command into a pane's shell, waits until it finishes, and exits with that command's status. phux snapshot reads the screen, and phux wait blocks until a line matches.
description: Type a shell command into a phux pane and read its output and exit code.
---

```sh
phux run --timeout 300 @7 'cargo test'
phux snapshot --json @7
phux wait --regex 'test result: (ok|FAILED)' --timeout 300 @7
```

`phux run` types the command into the pane's shell, waits until it finishes, and prints the output. The process exits with the command's own status. The text view ends with a line such as `exit=0 (155ms)`. `--json` prints a document instead of that text. `--timeout` is one budget for the whole run, including connecting, and defaults to 600 seconds. `0` waits without a limit. A run that hits the timeout exits 125. Giving up does not stop the command. Flags (`--timeout`, `--force`, `--json`) go before the target. Anything after the target is the command.

`run` refuses with exit 2 when the foreground program is not a POSIX shell (`sh`, `bash`, or `zsh`). In `vim` or `less` those bytes would be keystrokes. `--force` skips that check. Do not use `run` to type into a coding agent that is already in the foreground.

`phux snapshot` prints the screen. It does not attach, resize, or change the pane. `--json` includes the lines, cursor, size, and title.

`phux wait` polls until a line matches. It exits 0 on a match and 124 when `--timeout` runs out. With no `--timeout` it waits without a limit. `0` checks once. `--until` matches any line, including the command you just typed. `--output-only` ignores lines the shell marked as input, which needs a shell with OSC 133. The pattern above is `--regex`.

`@7` is a pane that exists now. `phux new --json -s work` creates a session without attaching and prints the seed pane's id. `--json` requires `-s`.

The other flags are in [Driving terminals from scripts](/scripting).

## Next

- [Driving terminals from scripts](/scripting)
- [See which coding agent is waiting on you](/agent-waiting)
