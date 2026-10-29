---
title: Give your agent a terminal over MCP
summary: phux is a terminal multiplexer with a built-in MCP server (phux mcp). Register it the way you register any other stdio server.
description: Register `phux mcp` with your agent so it can drive your terminal panes.
---

phux is a terminal multiplexer with a built-in MCP server (`phux mcp`).

```sh
claude mcp add phux -- phux mcp
phux mcp --schema
```

With no arguments, `phux mcp` serves MCP on stdin and stdout for the phux server on this machine. It forwards every argument to the MCP companion. `--schema` prints each tool and its input schema. `--skill` prints the guide for those tools. `--help` and `--version` are the other discovery modes.

Each tool mirrors one `phux` command and is marked read-only or destructive the same way the server treats it. Tools that kill, detach, send a destructive signal, or approve something require `confirm: true`.

The line above is how Claude Code registers a stdio server. Plugins for Claude Code, pi, Oh My Pi, OpenCode, and Grok register it for you. The install commands are on [Coding agents](/agents#mcp).

This server can type into your panes. The hosted server at [phux.sh/mcp](https://phux.sh/mcp) only searches documentation. It cannot see or control a local terminal. Connect that one with `claude mcp add --transport http phux-docs https://phux.sh/mcp`.

## Tool names

The ones most agents use: `phux_snapshot`, `phux_send_keys`, `phux_run`, `phux_wait`, `phux_agent_list`, `phux_agent_wait`. [CLI and MCP parity](/reference/parity) lists every tool, and `phux mcp --schema` prints each input schema.

## Next

- [Coding agents](/agents#mcp)
- [Run a command in a pane](/pane-command)
