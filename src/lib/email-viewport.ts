/** Keep an explicitly focused email form above Safari's visual-viewport keyboard. */
export function emailScrollDelta(top: number, bottom: number, viewportTop: number, height: number) {
  const margin = 20;
  if (top >= viewportTop + margin && bottom <= viewportTop + height - margin) return 0;
  return top - viewportTop - Math.max(margin, (height - (bottom - top)) / 2);
}

export function wireEmailViewport(form: HTMLFormElement): () => void {
  const controller = new AbortController();
  const host = keyboardHost();
  let frame = 0;
  const adjust = () => {
    frame = 0;
    const field = form.querySelector<HTMLInputElement>('input[name="email"]');
    if (!field || document.activeElement !== field) return;
    if (field.getClientRects().length === 0) return;
    const box = form.getBoundingClientRect();
    const frameTop = host.frame?.getBoundingClientRect().top ?? 0;
    const viewport = host.view.visualViewport;
    const delta = emailScrollDelta(box.top + frameTop, box.bottom + frameTop, viewport?.offsetTop ?? 0, viewport?.height ?? host.view.innerHeight);
    if (Math.abs(delta) > 1) host.view.scrollBy({ top: delta, behavior: "instant" });
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(adjust);
  };
  form.addEventListener("focusin", schedule, { signal: controller.signal });
  host.view.visualViewport?.addEventListener("resize", schedule, { signal: controller.signal });
  window.addEventListener("resize", schedule, { signal: controller.signal });
  return () => { controller.abort(); cancelAnimationFrame(frame); };
}

function keyboardHost(): { view: Window; frame: Element | null } {
  try {
    const frame = window.frameElement;
    if (frame) return { view: window.parent, frame };
  } catch {
    // A third-party embedding cannot grant access to its parent viewport.
  }
  return { view: window, frame: null };
}

/** Native choices, not an automatic focus into a field under a moving viewport. */
export function showMobileChoices(form: HTMLFormElement, phone: "ios" | "android") {
  const root = form.closest<HTMLElement>("[data-mobile-access]");
  if (!root) return;
  root.querySelectorAll<HTMLElement>("[data-testflight-link]").forEach(link => { link.hidden = phone !== "ios" || root.dataset.testflightUnavailable === "true"; });
  const email = root.querySelector<HTMLDetailsElement>("[data-email-invite]");
  if (email) email.open = phone === "android";
  const summary = email?.querySelector("summary");
  if (summary) summary.textContent = phone === "ios" ? "Email an invite instead" : "Request Google Play access";
  const submit = form.querySelector<HTMLElement>("[data-invite-submit]");
  if (submit) submit.textContent = phone === "ios" ? "Send invitation" : "Request access";
}
