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

/**
 * The CLI is a command. Desktop is a download, with its installer kept as the
 * terminal (and Linux) alternative. The mobile target swaps in the beta request.
 */
export const installTargets: InstallTarget[] = [
  { id: "cli", label: "CLI", command: cliInstall, note: "macOS and Linux · installs phux and phux-mcp" },
  { id: "desktop", label: "Desktop", command: desktopInstall, note: "Apple-silicon Mac · or install from a terminal on macOS or Linux" },
  { id: "mobile", label: "Mobile", command: "", note: "Beta: TestFlight on iPhone, Google Play testing on Android." },
];

/**
 * The stable Apple-silicon Desktop archive for a `desktop-vX.Y.Z` tag, named
 * the way phux's release model names it; the releases page when the build
 * stamped no Desktop release.
 */
export function desktopDownload(tag: string | null | undefined): string {
  const version = /^desktop-v(\d+\.\d+\.\d+)$/.exec(tag ?? "")?.[1];
  return version
    ? `${SITE.github}/releases/download/${tag}/phux-desktop-${version}-macos-arm64.zip`
    : `${SITE.github}/releases`;
}

/** Desktop releases are ad-hoc signed, not notarized, so a browser download meets Gatekeeper once. */
export const desktopFirstOpen = "First open: System Settings → Privacy & Security → Open Anyway.";

/** The same installer, told to print its plan and install nothing. */
export function dryRun(command: string) {
  return command.endsWith("| sh") ? `${command} -s -- --dry-run` : command;
}
