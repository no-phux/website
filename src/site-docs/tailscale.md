---
title: Reach your agents from anywhere with Tailscale
summary: Tailscale is the network between your machines. phux host discover lists the machines already on your tailnet, and phux attach connects to a phux server you added.
description: List the machines on your tailnet and attach to a phux server you added.
---

```sh
phux host discover
phux host add DNS_NAME --name mini --install --accept-new-host-key
phux attach mini
```

Tailscale is the network. It makes encrypted point-to-point connections between machines you install it on. That mesh is a tailnet ([what Tailscale is](https://tailscale.com/kb/1151/what-is-tailscale)). phux does not install Tailscale or sign you in. Their [install guide](https://tailscale.com/kb/1017/install) is the setup. MagicDNS is on by default and names each machine. `DNS_NAME` in the snippet is the name `phux host discover` prints.

`phux host discover` reads the local Tailscale client (`tailscale status --json`). It reports whether that client is signed in and connected, every other machine on the tailnet, which of them run an OS phux ships for, and which you already registered. It does not register a machine and it does not contact one. `--json` prints a document. `--login` signs in or reconnects first: it opens the macOS app, reconnects a stopped client, or prints a sign-in link and returns while the browser finishes. Run `phux host discover` again afterwards.

`phux host add` connects over SSH. `--install` installs phux on that machine, or updates an older copy, and unless you pass `--no-service` it installs a service so the server comes back after a reboot. The server's policy becomes `paired`. The direct attach uses QUIC on UDP 8788. `--accept-new-host-key` trusts an SSH host key you have never seen. A key that changed is still refused. [Remote machines](/remote#machines-on-your-tailnet) calls that flag safe on a tailnet, because the tailnet already vouches for the address. A machine that runs [Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh) needs no SSH key of yours. `--name mini` is the local label. `phux attach mini` then connects over QUIC, and SSH is no longer in the path.

`phux ls --all` lists sessions on this machine and on every machine you registered.

From a phone, use an SSH app and run `ssh -t user@host phux attach`. If that SSH session drops, the programs keep running, and so do the sessions and the scrollback. [What survives what](/concepts#what-survives-what). A server crash or a reboot ends the programs. Sessions, tabs, and panes come back without them. `phux restore` starts the programs again. The service from `phux host add` starts the server after a reboot. It does not start the programs.

On Windows, the CLI and TUI run under WSL 2. The native desktop build is not published yet. [Windows (WSL)](/installation#windows-wsl).

phux has no accounts and no hosted service. Each machine runs its own server. A machine you add can do everything you can do on that server, including typing into panes. Only add machines you control. With no remote configuration, the server accepts only the local socket.

## Next

- [Remote machines](/remote)
- [See which coding agent is waiting on you](/agent-waiting)
