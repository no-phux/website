// SoftwareApplication facts for phux.sh and docs.phux.sh.
// softwareVersion comes from the docs manifest written by sync-docs, which
// reads Cargo.toml for this build. Omit it when that file is absent.
// codeRepository is a SoftwareSourceCode property, linked back by @id.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "./site";

/** Shipped installs. Phone apps stay out of this until they are public. */
export const SHIPPED_OPERATING_SYSTEM = "macOS (Apple silicon), Linux, Windows via WSL 2";
export const APACHE_LICENSE = "https://www.apache.org/licenses/LICENSE-2.0";
export const SOFTWARE_ID = `${SITE.url}/#software`;

export interface SoftwareSourceCode {
  "@type": "SoftwareSourceCode";
  codeRepository: string;
  url: string;
  targetProduct: { "@id": string };
}

export interface SoftwareApplicationNode {
  "@type": "SoftwareApplication";
  "@id": string;
  name: string;
  description: string;
  applicationCategory: "DeveloperApplication";
  operatingSystem: string;
  license: string;
  offers: { "@type": "Offer"; price: "0"; priceCurrency: "USD" };
  url: string;
  softwareVersion?: string;
}

export interface SoftwareApplication {
  "@context": "https://schema.org";
  "@graph": [SoftwareApplicationNode, SoftwareSourceCode];
}

/** `version` null omits softwareVersion. Undefined reads the build manifest. */
export function softwareApplication(version?: string | null): SoftwareApplication {
  const softwareVersion = version === undefined ? readProjectVersion() : version || undefined;
  const application: SoftwareApplicationNode = {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: SITE.name,
    description: SITE.tagline,
    applicationCategory: "DeveloperApplication",
    operatingSystem: SHIPPED_OPERATING_SYSTEM,
    license: APACHE_LICENSE,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: SITE.url,
    ...(softwareVersion ? { softwareVersion } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      application,
      {
        "@type": "SoftwareSourceCode",
        codeRepository: SITE.github,
        url: SITE.github,
        targetProduct: { "@id": SOFTWARE_ID },
      },
    ],
  };
}

export function softwareApplicationJson(): string {
  return JSON.stringify(softwareApplication()).replace(/</g, "\\u003c");
}

export function readProjectVersion(): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/docs-manifest.json"), "utf8")) as { projectVersion?: unknown };
    return typeof manifest.projectVersion === "string" && manifest.projectVersion ? manifest.projectVersion : undefined;
  } catch {
    return undefined;
  }
}
