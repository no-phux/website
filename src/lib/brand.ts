import lock from "../../brand.lock.json";

/** The approved transparent mono artwork, installed by scripts/brand.py only. */
export const MONO_WORDMARK_DESTINATION = "public/brand/images/mono-wordmark.svg";

export function monoWordmarkUrl(release: {
  version: string;
  files: Record<string, { destination: string }>;
} = lock): string {
  if (!Object.values(release.files).some(file => file.destination === MONO_WORDMARK_DESTINATION)) {
    throw new Error("The pinned brand release must include the canonical mono wordmark");
  }
  return `/brand/images/mono-wordmark.svg?v=${encodeURIComponent(release.version)}`;
}
