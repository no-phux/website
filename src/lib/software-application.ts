// SoftwareApplication facts for phux.sh and docs.phux.sh.
// softwareVersion comes from the docs manifest written by sync-docs, which
// reads Cargo.toml for this build. Omit it when that file is absent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "./site";

/** Shipped installs. Phone apps stay out of this until they are public. */
export const SHIPPED_OPERATING_SYSTEM = "macOS (Apple silicon), Linux, Windows via WSL 2";
export const APACHE_LICENSE = "https://www.apache.org/licenses/LICENSE-2.0";

export interface SoftwareApplication {
  "@context": "https://schema.org";
  "@type": "SoftwareApplication";
  name: string;
  applicationCategory: "DeveloperApplication";
  operatingSystem: string;
  license: string;
  offers: { "@type": "Offer"; price: "0"; priceCurrency: "USD" };
  codeRepository: string;
  url: string;
  softwareVersion?: string;
}

/** `version` null omits softwareVersion. Undefined reads the build manifest. */
export function softwareApplication(url: string, version?: string | null): SoftwareApplication {
  const softwareVersion = version === undefined ? readProjectVersion() : version || undefined;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "DeveloperApplication",
    operatingSystem: SHIPPED_OPERATING_SYSTEM,
    license: APACHE_LICENSE,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    codeRepository: SITE.github,
    url,
    ...(softwareVersion ? { softwareVersion } : {}),
  };
}

export function softwareApplicationJson(url: string): string {
  return JSON.stringify(softwareApplication(url)).replace(/</g, "\\u003c");
}

export function readProjectVersion(): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/docs-manifest.json"), "utf8")) as { projectVersion?: unknown };
    return typeof manifest.projectVersion === "string" && manifest.projectVersion ? manifest.projectVersion : undefined;
  } catch {
    return undefined;
  }
}
