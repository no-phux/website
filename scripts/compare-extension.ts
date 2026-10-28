/**
 * Website-owned rows appended to the synced compare page.
 * The phux repo keeps the tmux, Herdr, and cmux sections.
 */

const CHECKED = "2026-10-27";

export function extendComparePage(body: string, revision: string): string {
  const stripped = body.replaceAll("; phone apps in progress", "");
  const block = `\n${compareExtension(revision)}\n`;
  const marker = "\n## Next\n";
  const index = stripped.indexOf(marker);
  if (index === -1) return `${stripped.replace(/\s*$/, "")}\n${block}`;
  return `${stripped.slice(0, index)}${block}${stripped.slice(index)}`;
}

function compareExtension(revision: string): string {
  const license = `https://github.com/no-phux/phux/blob/${revision}/LICENSE`;
  return `## Compared with zellij and WezTerm

Competitor facts in this section and the two after it were checked on ${CHECKED} against the pages linked in the cells. phux's Windows desktop availability was updated on 2026-10-28 against the [desktop v0.51.0 release assets](https://github.com/no-phux/phux/releases/tag/desktop-v0.51.0). These additions are maintained in the [website repository](https://github.com/no-phux/website); the earlier tmux, Herdr, and cmux sections come from phux's \`docs/compare.md\`.

| | zellij | WezTerm | phux |
| --- | --- | --- | --- |
| What it is | A terminal workspace. The project also calls this a terminal multiplexer. [README](https://github.com/zellij-org/zellij/blob/main/README.md) | A terminal emulator and multiplexer. [README](https://github.com/wezterm/wezterm/blob/main/README.md) | A terminal multiplexer whose server you can drive from code. |
| License | MIT. [LICENSE.md](https://github.com/zellij-org/zellij/blob/main/LICENSE.md) | MIT. Bundled JetBrains Mono, Noto Color Emoji, Roboto, and Symbols Nerd Font Mono are OFL 1.1. [LICENSE.md](https://github.com/wezterm/wezterm/blob/main/LICENSE.md) | Apache-2.0. [LICENSE](${license}) |
| Config | KDL, in \`config.kdl\`. [Configuration](https://zellij.dev/documentation/configuration.html) | Lua. The file they recommend to start is \`$HOME/.wezterm.lua\` (\`%USERPROFILE%/.wezterm.lua\` on Windows). By default WezTerm watches that file and reloads it when it changes. [Config files](https://wezterm.org/config/files.html), [\`automatically_reload_config\`](https://wezterm.org/config/lua/config/automatically_reload_config.html) | One TOML file: \`~/.config/phux/config.toml\`, or \`$XDG_CONFIG_HOME/phux/config.toml\`. \`phux config reload\`. [Config](./config.md) |
| Plugins | WebAssembly / WASI. Rust is the only language the plugin page says is officially supported. [Plugins](https://zellij.dev/documentation/plugins.html) | Lua plugins, loaded from a Git URL with \`wezterm.plugin.require\`. [Plugins](https://wezterm.org/config/plugins.html) | A directory with a \`phux-plugin.toml\` manifest. Commands run as separate processes. phux does not load plugin code into the server. [Plugins](./plugins.md) |
| Driving it from code | \`zellij action\`, including \`zellij --session NAME action\`. Subscribe streams pane output. \`zellij watch\` is read-only. [CLI](https://zellij.dev/documentation/controlling-zellij-through-cli.html) | \`wezterm cli\` talks to a running GUI or multiplexer. Subcommands include \`spawn\`, \`split-pane\`, \`send-text\`, and \`get-text\`. [CLI](https://wezterm.org/cli/cli/index.html) | Commands with JSON output, an MCP server, and the protocol its clients use. [Scripting](./scripting.md) |
| Clients | A built-in web server since version 0.43.0. Started with \`zellij web\`, it listens on \`http://127.0.0.1:8082\` by default. An SSL certificate is required to listen beyond the local machine. [Web client](https://zellij.dev/tutorials/web-client/) | The GUI. Unix, SSH, and TLS multiplexer domains are further configuration, not the out-of-the-box local tabs. [Multiplexing](https://wezterm.org/multiplexing.html) | Terminal UI and desktop app. A browser client is in the repository and is not shipped; its listeners are off by default. [Clients](./clients.md) |
| Platforms | Prebuilt binaries for Linux, macOS, and Windows (\`zellij.exe\`). [Installation](https://zellij.dev/documentation/installation.html) | Linux, macOS, Windows 10, FreeBSD, and NetBSD. [Features](https://wezterm.org/features.html) | macOS on Apple silicon, and Linux x86_64 or arm64 with glibc. On Windows the CLI and TUI run under WSL 2; native desktop x64 uses that WSL coordinator (desktop 0.50.0+). No Intel Mac build and no musl build. [Install](./install.md) |
| Close the window | \`zellij action detach\` leaves the session running in the background. [detach](https://zellij.dev/documentation/cli-actions.html#detach) | Out of the box, local tabs and windows persist until they are closed. [Multiplexing](https://wezterm.org/multiplexing.html) | Detach leaves programs running. [What survives what](./concepts.md#what-survives-what) |
| After the server or machine stops | By default, session resurrection serializes the layout and the command in each pane, then re-runs those commands behind a "Press ENTER to run..." banner. The viewport and scrollback stay out unless the config turns them on. [Session resurrection](https://zellij.dev/documentation/session-resurrection.html) | The multiplexing page describes tabs and windows that persist until closed. It does not describe restoring programs after a reboot. | Sessions, tabs, and panes come back. Programs and scrollback do not. [What survives what](./concepts.md#what-survives-what) |
| An agent waiting on you | Not described on the pages linked in this table. | Not described on the pages linked in this table. | \`blocked\` means that agent is waiting on you. [Coding agents](./agents.md) |

zellij is the better choice for a Windows binary (\`zellij.exe\`), the built-in web client, WebAssembly plugins, session resurrection, or the "true multiplayer collaboration" its [README](https://github.com/zellij-org/zellij/blob/main/README.md) describes.

WezTerm is the better choice for a GUI on Windows 10, FreeBSD, or NetBSD, a Lua config, and \`wezterm cli\`.

phux is the choice for a background server you drive with commands and JSON, a recorded agent state, or \`phux host add\` and then a QUIC attach. [Remote machines](./remote.md). The desktop and terminal UI draw with libghostty, the same emulator the server uses. [Clients](./clients.md).

## phux and Rex

Rex is [Superlogical's](https://www.superlogical.com) terminal multiplexer. Their site says they are building "the multiplexer for all work," and that they will begin with a terminal multiplexer.

Checked on ${CHECKED}. The cells are what the linked pages say. Those pages do not state a license for Rex, so this table does not add one.

| | Rex, as Superlogical's pages describe it | phux |
| --- | --- | --- |
| Who publishes it | Superlogical | phux, under Apache-2.0. [LICENSE](${license}) |
| Account | Free, no account, and self-hostable. The docs index says "no account or license checks." [Public testing, 5 Oct 2026](https://www.superlogical.com/updates/public-testing-beginning), [docs index](https://www.superlogical.com/rex/docs.md) | No accounts and no hosted service. Each machine runs its own server. [Remote machines](./remote.md) |
| What you can install today | The macOS app is available to all testers. The Linux server goes to Linux testing waves. Invites go to the mailing list. [Installation](https://www.superlogical.com/rex/docs/installation.md), [public testing](https://www.superlogical.com/updates/public-testing-beginning) | Install today on macOS Apple silicon and Linux. On Windows the CLI and TUI run under WSL 2. [Install phux](https://phux.sh/install). [Platforms](./install.md) |
| Sharing a live session | The homepage says: "Sessions can be accessed through the web and native macOS/iOS applications, and sharing a live session with other people is built in from the start." That sentence is in the plan on the homepage. | Several clients can show one session at once. A machine you pair can do everything you can. [Concepts](./concepts.md#clients), [Remote machines](./remote.md#who-can-do-what) |
| Another machine | Not stated on the pages linked in this table. | \`phux host add\`, then attach over QUIC. \`phux host discover\` lists machines already on a Tailscale tailnet. [Remote machines](./remote.md) |

## Where phux isn't the answer

- An Intel Mac, or musl libc. There is no build for either. [Install](./install.md)
- Windows without WSL 2. The CLI, TUI, and native desktop's coordinator require WSL 2. Zellij publishes \`zellij.exe\`. WezTerm's feature list includes Windows 10, FreeBSD, and NetBSD.
- Sharing a session between people. Several clients can show one session at once, and a machine you pair gets your full access, but a pane has one size for every viewer and the docs describe no invite or per-person flow. Zellij's README describes true multiplayer collaboration, and Superlogical's homepage says sharing a live session with other people is built in from the start.
`;
}
