// Mobile beta requests, shared by the live hero, the homepage, and /more.
//
// POST /api/beta reaches host/analytics.ts. For iPhone it goes on to
// host/testflight.ts, which adds the address to the App Store Connect external
// group (Apple then emails the invite). The request also goes through the member
// pipeline. `website` is the honeypot the Worker drops before doing anything.

import { showMobileChoices, wireEmailViewport } from "./email-viewport";

type BetaResponse = {
  ok?: boolean;
  status?: string;
  error?: string;
};

export type Phone = "ios" | "android";

/** What the request form says. The pages offer the iPhone beta only. */
export const phones = {
  ios: {
    label: "iPhone",
    placeholder: "Apple Account email",
    field: "Email address for the TestFlight invite",
  },
} as const;

/**
 * The visitor's phone, or null on a computer. iPadOS reports a Mac user agent,
 * so a touch-capable "Macintosh" is an iPad.
 */
export function detectPhone(nav: { userAgent?: string; maxTouchPoints?: number } | undefined): Phone | null {
  const agent = nav?.userAgent ?? "";
  if (/Android/i.test(agent)) return "android";
  if (/iPhone|iPad|iPod/.test(agent)) return "ios";
  if (/Macintosh/.test(agent) && (nav?.maxTouchPoints ?? 0) > 1) return "ios";
  return null;
}

/**
 * Wire one beta request form. Safe to call with a missing form, and never
 * throws: a network or parse failure surfaces in the note instead.
 */
export function wireBetaRequest(
  form: HTMLFormElement | null,
  note: HTMLElement | null,
): (() => void) | undefined {
  if (!form) return;
  const controller = new AbortController();
  const disposeViewport = wireEmailViewport(form);
  const email = form.elements.namedItem("email") as HTMLInputElement | null;
  const trap = form.elements.namedItem("website") as HTMLInputElement | null;
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");

  showMobileChoices(form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(form, email, trap, button, note);
  }, { signal: controller.signal });
  return () => { controller.abort(); disposeViewport(); };
}

/** The note after a successful request. */
export function requestedNote(status: string | undefined, email: string): string {
  return status === "invited"
    ? "Invite sent. Check " + email + " for an email from TestFlight."
    : "Request received. The TestFlight invite will go to " + email + ".";
}

async function submit(
  form: HTMLFormElement,
  email: HTMLInputElement | null,
  trap: HTMLInputElement | null,
  button: HTMLButtonElement | null,
  note: HTMLElement | null,
): Promise<void> {
  const value = email?.value.trim() ?? "";
  email?.blur();
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/beta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: value, website: trap?.value ?? "", platform: "ios" }),
    });
    const result = (await response.json()) as BetaResponse;
    finishRequest(result, form, note, value);
  } catch {
    if (note) note.textContent = "Could not connect. Try again.";
  } finally {
    if (button) button.disabled = false;
  }
}

function finishRequest(result: BetaResponse, form: HTMLFormElement, note: HTMLElement | null, value: string) {
  if (!result.ok) {
    if (note) note.textContent = "Could not request access: " + (result.error ?? "try again.");
    return;
  }
  if (note) note.textContent = requestedNote(result.status, value);
  form.reset();
}
