import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, MarkdownIcon, SourceIcon } from "./icons";

/**
 * A compact icon row beside the title. Links work without JavaScript; copying
 * is progressive enhancement and reports its outcome in a polite live region.
 */
export function PageActions({ pathname, sourceUrl }: { pathname: string; sourceUrl?: string }) {
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const reset = useRef<number | undefined>(undefined);
  const markdownUrl = `${pathname.replace(/\/$/, "")}.md`;

  useEffect(() => () => clearTimeout(reset.current), []);

  async function readMarkdown() {
    const response = await fetch(markdownUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Markdown unavailable");
    return new Blob([await response.text()], { type: "text/plain" });
  }

  async function copyPage() {
    clearTimeout(reset.current);
    setCopying(true);
    setStatus("");
    try {
      // Start the clipboard write in the click gesture, not after the fetch.
      // WebKit requires this even when the content itself arrives asynchronously.
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": readMarkdown() })]);
      setCopied(true);
      setStatus("Page copied as Markdown.");
      reset.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus("Copy unavailable. View the Markdown and copy the text manually.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="reader-actions" data-page-actions>
      <button type="button" className="reader-icon-button" onClick={copyPage} disabled={copying} aria-label="Copy page as Markdown" title="Copy page as Markdown">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <a className="reader-icon-button" href={markdownUrl} aria-label="View as Markdown" title="View as Markdown">
        <MarkdownIcon />
      </a>
      {sourceUrl && (
        <a className="reader-icon-button" href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub" title="View source on GitHub">
          <SourceIcon />
        </a>
      )}
      <span className="reader-actions-status" role="status" aria-live="polite">{status}</span>
    </div>
  );
}
