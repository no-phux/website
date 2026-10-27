import { detectPhone, type Phone } from "./beta";
import { desktopDownload } from "./install";
import { docsHref } from "./site";

export type InstallPlatform = "iphone" | "ipad" | "android" | "mac" | "linux" | "windows" | "unknown";
type Visitor = Parameters<typeof detectPhone>[0];
type InstallAction = { label: string; href: string; note: string; icon: string; target?: "mobile" | "cli"; phone?: Phone };

export function detectInstallPlatform(visitor: Visitor): InstallPlatform {
  const phone = detectPhone(visitor);
  if (phone === "android") return "android";
  const agent = visitor?.userAgent ?? "";
  if (phone === "ios") return /iPad|Macintosh/i.test(agent) ? "ipad" : "iphone";
  if (/Macintosh|Mac OS X/i.test(agent)) return "mac";
  if (/Windows/i.test(agent)) return "windows";
  if (/Linux/i.test(agent)) return "linux";
  return "unknown";
}

/** Published installs. The homepage names these and nothing else. */
export const shippedPlatforms = "macOS, Linux, Windows via WSL 2";

const choose = {
  label: "Choose your platform",
  href: docsHref("/installation"),
  note: shippedPlatforms,
  icon: "↗",
} as const;

export const installActions: Record<InstallPlatform, InstallAction> = {
  iphone: { ...choose },
  ipad: { ...choose },
  android: { ...choose },
  mac: { label: "Download for Mac", href: desktopDownload, note: "Apple silicon · macOS 26 or later · Apache-2.0 · No account", icon: "↓" },
  linux: { label: "Install for Linux", href: docsHref("/installation"), note: "Linux · CLI and desktop · Apache-2.0 · No account", icon: "→", target: "cli" },
  windows: { label: "Install with WSL", href: docsHref("/installation"), note: "Windows via WSL 2", icon: "↗" },
  unknown: { ...choose },
};

/** The closing shell command is for macOS and Linux. Other visitors get the install guide. */
export function hidesClosingCommand(platform: InstallPlatform): boolean {
  return platform === "iphone" || platform === "ipad" || platform === "android" || platform === "windows";
}

/** Shared hero and closing actions; never guess Mac from the viewport width. */
export function wireDeviceInstall() {
  const platform = detectInstallPlatform(navigator);
  const action = installActions[platform];
  document.documentElement.dataset.installPlatform = platform;
  document.querySelectorAll<HTMLAnchorElement>("[data-device-install]").forEach(link => {
    link.href = action.href;
    link.querySelector("[data-device-label]")!.textContent = action.label;
    link.querySelector("[data-device-icon]")!.textContent = action.icon;
    if (!action.target) return;
    link.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openInstall(action);
    });
  });
  document.querySelector<HTMLElement>(".download-note")!.textContent = action.note;
  document.querySelector<HTMLElement>(".closing-command")!.hidden = hidesClosingCommand(platform);
}

function openInstall(action: InstallAction) {
  const details = document.querySelector<HTMLDetailsElement>("#install-options")!;
  details.open = true;
  details.querySelector<HTMLButtonElement>(`[data-install-target="${action.target}"]`)!.click();
  details.querySelector<HTMLElement>(".install-copy")!.focus();
}
