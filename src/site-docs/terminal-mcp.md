---
title: Give your agent a terminal over MCP
summary: phux mcp serves your local phux server as MCP tools on stdin and stdout. Register it with the agent the same way you register any other stdio server.
description: Serve the local phux server over MCP so an agent can drive panes from its session.
---

```sh
claude mcp add phux -- phux mcp
phux mcp --schema
```

With no arguments, `phux mcp` serves MCP on stdin and stdout for the phux server on this machine. It forwards every argument to the MCP companion. `--schema` prints each tool and its input schema. `--skill` prints the guide for those tools. `--help` and `--version` are the other discovery modes.

Each tool mirrors one `phux` command and is marked read-only or destructive the same way the server treats it. Tools that kill, detach, send a destructive signal, or approve something require `confirm: true`.

The line above is how Claude Code registers a stdio server. Plugins for Claude Code, pi, Oh My Pi, OpenCode, and Grok register it for you. The install commands are on [Coding agents](/agents#mcp).

This server can type into your panes. The hosted server at [phux.sh/mcp](https://phux.sh/mcp) only searches documentation. It cannot see or control a local terminal. Connect that one with `claude mcp add --transport http phux-docs https://phux.sh/mcp`.

## Next

- [Coding agents](/agents#mcp)
- [Run a command in a pane](/pane-command)
