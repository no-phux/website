import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useTheme } from "fumadocs-ui/provider/base";
import { CloseIcon, SearchIcon } from "./icons";

const subscribe = () => () => {};
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

/** A quiet native select: Light, Dark, or System (the default). */
export function ReaderTheme() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <label className="reader-theme">
      <span>Theme</span>
      <select aria-label="Reading theme" value={mounted ? theme : "system"} onChange={(event) => setTheme(event.target.value)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

/** The pill that opens search, with the platform shortcut. */
export function SearchButton({ compact = false }: { compact?: boolean }) {
  const { setOpenSearch, hotKey } = useSearchContext();
  return (
    <button
      type="button"
      className={compact ? "reader-icon-button" : "reader-search-button"}
      data-search=""
      aria-label="Search documentation"
      onClick={() => setOpenSearch(true)}
    >
      <SearchIcon />
      {!compact && <span className="reader-search-label">Search</span>}
      {!compact && (
        <kbd className="reader-search-keys" aria-hidden="true">
          {hotKey.map((key, index) => <span key={index}>{key.display}</span>)}
        </kbd>
      )}
    </button>
  );
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}

/** `/` opens search too, unless the reader is typing somewhere. ⌘K/Ctrl-K is the provider's. */
export function useSlashSearch() {
  const { setOpenSearch } = useSearchContext();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      setOpenSearch(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpenSearch]);
}

/**
 * The narrow-screen navigation: a native modal dialog, so Escape closes it,
 * focus stays inside, and closing returns focus to the opener. Opening search
 * closes it first.
 */
export function NavigationDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { open: searchOpen } = useSearchContext();

  useEffect(() => {
    if (searchOpen && open) onClose();
  }, [searchOpen, open, onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    element.querySelector<HTMLButtonElement>(".reader-drawer-close")?.focus();
    return () => {
      element.close();
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="reader-drawer"
      aria-label="Documentation navigation"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {open && (
        <div className="reader-drawer-panel" data-reader-scroll="">
          <div className="reader-drawer-head">
            <button type="button" className="reader-icon-button reader-drawer-close" aria-label="Close navigation" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
