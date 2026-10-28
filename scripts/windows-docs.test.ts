import { expect, test } from "bun:test";
import { createPageRenderer } from "./docs-markdown";
import type { Entry } from "./docs-catalog";

const versions = { protocolVersion: "1.2.3", projectVersion: "0.4.5" };
const entry: Entry = { repoPath: "docs/clients.md", abs: "/unused", slug: "clients", group: "connect", order: 1 };

test("preserves the released native Windows desktop and its WSL requirements", () => {
  const render = createPageRenderer([entry], "a".repeat(40), versions);
  const clients = render(`# Clients

The terminal UI.

## Desktop

Phux Desktop is a native app for macOS 26 or later on Apple silicon,
Linux on x86_64 or arm64 with Vulkan, and Windows x64 with a WSL 2 server.
On macOS and Linux, install it with:

The [Windows app](../clients/desktop/README.md#windows) uses native Direct3D
rendering, input and clipboard; shells and agents stay in WSL. Its desktop
updates use the Windows installer. WSLg is not required. The local Changes
panel and external Unix developer socket are not available on Windows.

It shows every session.
`, entry);
  expect(clients).toContain("Windows x64 with a WSL 2 server");
  expect(clients).toContain("Windows app");
  expect(clients).toContain("The local Changes");
  expect(clients).not.toContain("not published yet");
  const install = { ...entry, repoPath: "docs/install.md", slug: "installation" };
  const installation = createPageRenderer([install], "a".repeat(40), versions)(`# Install

One command.

Windows uses these Linux CLI/server builds through [WSL](#windows-wsl),
including from PowerShell. The [Windows desktop](../clients/desktop/README.md#windows)
is native, with its coordinator in WSL. There is no native Windows coordinator
or Intel Mac build.

The terminal UI runs in WSL; the native Windows desktop
connects to the same coordinator.

inside WSL. Neither step removes your distribution. For a native window,
see [Windows Desktop](../clients/desktop/README.md#windows); WSLg is not required.
`, install);
  expect(installation).toContain("is native, with its coordinator in WSL");
  expect(installation).toContain("There is no native Windows coordinator\nor Intel Mac build.");
  expect(installation).toContain("The terminal UI runs in WSL;");
  expect(installation).toContain("connects to the same coordinator");
  expect(installation).toContain("Windows Desktop");
});
