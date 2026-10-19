// Mobile beta requests for phux-mobile, shared by the live hero, the classic
// landing, and /more.
//
// POST /api/beta reaches host/analytics.ts. For iPhone it goes on to
// host/testflight.ts, which adds the address to the App Store Connect external
// group (Apple then emails the invite); for Android it is recorded for the
// Google Play testing list. Either way the request also goes through the member
// pipeline. `website` is the honeypot the Worker drops before doing anything.

type BetaResponse = {
  ok?: boolean;
  status?: string;
  error?: string;
};

export type Phone = "ios" | "android";

/** What the request form says for each phone. */
export const phones: Record<Phone, { label: string; placeholder: string; field: string; other: Phone }> = {
  ios: {
    label: "iPhone",
    placeholder: "Apple Account email",
    field: "Email address for the TestFlight invite",
    other: "android",
  },
  android: {
    label: "Android",
    placeholder: "Google account email",
    field: "Email address for the Google Play test",
    other: "ios",
  },
};

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

/** The phone a form opens on: the visitor's own, else iPhone. */
export const initialPhone = (): Phone =>
  detectPhone(typeof navigator === "undefined" ? undefined : navigator) ?? "ios";

/**
 * Point a plain-DOM request form at `phone`: its `data-phone`, the email
 * field's prompt, and the switch that offers the other phone.
 */
function showPhone(form: HTMLFormElement, phone: Phone, toggle: HTMLButtonElement | null): void {
  const copy = phones[phone];
  form.dataset.phone = phone;
  const email = form.elements.namedItem("email") as HTMLInputElement | null;
  email?.setAttribute("placeholder", copy.placeholder);
  email?.setAttribute("aria-label", copy.field);
  if (toggle) toggle.textContent = `${phones[copy.other].label} instead`;
}

/**
 * Wire one beta request form. Safe to call with a missing form, and never
 * throws: a network or parse failure surfaces in the note instead. The phone
 * is read from the form's `data-phone` at submit time (iPhone when absent).
 * With `toggle`, the form opens on the visitor's phone and the button flips it.
 */
export function wireBetaRequest(
  form: HTMLFormElement | null,
  note: HTMLElement | null,
  toggle: HTMLButtonElement | null = null,
): void {
  if (!form) return;
  const email = form.elements.namedItem("email") as HTMLInputElement | null;
  const trap = form.elements.namedItem("website") as HTMLInputElement | null;
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");

  if (toggle) {
    showPhone(form, initialPhone(), toggle);
    toggle.addEventListener("click", () => {
      showPhone(form, phones[phoneOf(form)].other, toggle);
      if (note) note.textContent = "";
    });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(form, email, trap, button, note);
  });
}

function phoneOf(form: HTMLFormElement): Phone {
  return form.dataset.phone === "android" ? "android" : "ios";
}

/** The note after a successful request. */
export function requestedNote(phone: Phone, status: string | undefined, email: string): string {
  if (phone === "android") {
    return "Request received. We add " + email + " to the Google Play test and email you the link.";
  }
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
  const phone = phoneOf(form);
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/beta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: value, website: trap?.value ?? "", platform: phone }),
    });
    const result = (await response.json()) as BetaResponse;
    if (!result.ok) {
      if (note) {
        note.textContent =
          "Could not request access: " + (result.error ?? "try again.");
      }
      return;
    }
    if (note) note.textContent = requestedNote(phone, result.status, value);
    form.reset();
  } catch {
    if (note) note.textContent = "Could not connect. Try again.";
  } finally {
    if (button) button.disabled = false;
  }
}
