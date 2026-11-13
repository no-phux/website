import type { CSSProperties } from "react";
import { monoWordmarkUrl } from "../lib/brand";
import "./wordmark.css";

/** Shared logo artwork, not a font: the fox remains a separate brand mark. */
export function Wordmark({ decorative = false }: { decorative?: boolean }) {
  const source = monoWordmarkUrl();
  return (
    <span
      className="phux-wordmark phux-wordmark-art"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "PHUX"}
      aria-hidden={decorative || undefined}
      style={{ "--wordmark-source": `url("${source}")` } as CSSProperties}
    >
      <img src={source} alt="" aria-hidden="true" />
    </span>
  );
}
