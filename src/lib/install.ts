// The curl installers and the claims the homepage makes about them. Every
// claim here is checked against the published script (phux scripts/install.sh):
// it verifies the release SHA-256 (and its minisign signature when minisign is
// present) before installing, never calls sudo, defaults to ~/.local/bin, and
// both installers forward `--dry-run`.
import { SITE } from "./site";

export const cliInstall = "curl -fsSL https://phux.sh/install | sh";
export const desktopInstall = "curl -fsSL https://phux.sh/install-desktop | sh";
export const installScriptSource = `${SITE.github}/blob/main/scripts/install.sh`;

export type InstallTarget = { id: "cli" | "desktop" | "mobile"; label: string; command: string; note: string };

/** Command targets carry a command; the mobile target swaps in the TestFlight request. */
export const installTargets: InstallTarget[] = [
  { id: "cli", label: "CLI", command: cliInstall, note: "macOS and Linux · installs phux and phux-mcp" },
  { id: "desktop", label: "Desktop", command: desktopInstall, note: "Apple-silicon macOS · installs the CLI too, then opens Phux.app" },
  { id: "mobile", label: "Mobile", command: "", note: "No install: open the demo, scan its code, drive the shell from your phone. App in TestFlight." },
];

/** The same installer, told to print its plan and install nothing. */
export function dryRun(command: string) {
  return command.endsWith("| sh") ? `${command} -s -- --dry-run` : command;
}
