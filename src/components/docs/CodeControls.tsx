import { useEffect } from "react";

/** Add a copy control to the existing static code; never replace its selectable text. */
export function CodeControls({ pathname }: { pathname: string }) {
  useEffect(() => {
    const cleanups = Array.from(document.querySelectorAll<HTMLPreElement>("#docs-main .reader-prose pre"), enhanceCode);
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [pathname]);
  return null;
}

const COPY = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7"/></svg>';
const DONE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3.5 8.5 3 3 6-7"/></svg>';

function enhanceCode(pre: HTMLPreElement) {
  const shell = document.createElement("div");
  shell.className = "docs-code";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "docs-code-copy";
  button.setAttribute("aria-label", "Copy code");
  button.title = "Copy code";
  button.innerHTML = COPY;
  const status = document.createElement("span");
  status.className = "docs-code-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  pre.before(shell);
  shell.append(pre, button, status);
  const originalTabIndex = pre.getAttribute("tabindex");
  pre.tabIndex = 0;
  let disposed = false;
  let timeout: number | undefined;

  async function copy() {
    clearTimeout(timeout);
    status.textContent = "";
    try {
      await navigator.clipboard.writeText(pre.textContent ?? "");
      if (disposed) return;
      button.innerHTML = DONE;
      button.dataset.copied = "";
      status.textContent = "Code copied to clipboard.";
    } catch {
      if (disposed) return;
      shell.dataset.error = "";
      status.textContent = "Copy unavailable. Select the code and copy it manually.";
      pre.focus();
    }
    timeout = window.setTimeout(() => {
      button.innerHTML = COPY;
      delete button.dataset.copied;
      delete shell.dataset.error;
      status.textContent = "";
    }, "error" in shell.dataset ? 6000 : 2000);
  }

  button.addEventListener("click", copy);
  return () => {
    disposed = true;
    clearTimeout(timeout);
    button.removeEventListener("click", copy);
    if (originalTabIndex === null) pre.removeAttribute("tabindex");
    else pre.setAttribute("tabindex", originalTabIndex);
    shell.replaceWith(pre);
  };
}
