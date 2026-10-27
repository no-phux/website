// The curl installers and the claims the homepage makes about them. Every
// claim here is checked against the published script (phux scripts/install.sh):
// it verifies the release SHA-256 (and its minisign signature when minisign is
// present) before installing, never calls sudo, defaults to ~/.local/bin, and
// both installers forward `--dry-run`.
import { SITE } from "./site";

export const cliInstall = "curl -fsSL https://phux.sh/install | sh";
export const desktopInstall = "curl -fsSL https://phux.sh/install-desktop | sh";
export const installScriptSource = `${SITE.github}/blob/main/scripts/install.sh`;

export type InstallTarget = { id: "cli" | "desktop"; label: string; command: string; note: string };

/**
 * The CLI is a command. Desktop is a download, with its installer kept as the
 * terminal (and Linux) alternative. The homepage picker stops there: the mobile
 * apps are not public, and `/more` keeps the beta request on its own.
 */
export const installTargets: InstallTarget[] = [
  { id: "cli", label: "CLI", command: cliInstall, note: "macOS and Linux · installs phux and phux-mcp" },
  { id: "desktop", label: "Desktop", command: desktopInstall, note: "Apple-silicon Mac · or install from a terminal on macOS or Linux. Installs the phux CLI too if none is found." },
];

/** The stable Apple-silicon Desktop archive; the site worker resolves it per click (host/download.ts). */
export const desktopDownload = "/download/desktop";
/** Existing enabled public TestFlight group, resolved by the site Worker. */
export const iosDownload = "/download/ios";

/** Pending a real-Mac check. Delete this line if that Mac shows no confirmation dialog. */
export const desktopFirstOpen = "First open: macOS asks to confirm an app downloaded from the internet. Choose Open.";

/** The same installer, told to print its plan and install nothing. */
export function dryRun(command: string) {
  return command.endsWith("| sh") ? `${command} -s -- --dry-run` : command;
}
