import { describe, expect, test } from "bun:test";
import { APACHE_LICENSE, SHIPPED_OPERATING_SYSTEM, softwareApplication } from "../src/lib/software-application";

describe("SoftwareApplication JSON-LD", () => {
  test("names the shipped systems, the Apache license, and a zero price", () => {
    const data = softwareApplication("https://phux.sh", "0.113.1");
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.name).toBe("phux");
    expect(data.applicationCategory).toBe("DeveloperApplication");
    expect(data.operatingSystem).toBe(SHIPPED_OPERATING_SYSTEM);
    expect(data.operatingSystem).toBe("macOS (Apple silicon), Linux, Windows via WSL 2");
    expect(data.license).toBe(APACHE_LICENSE);
    expect(data.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "USD" });
    expect(data.codeRepository).toBe("https://github.com/no-phux/phux");
    expect(data.softwareVersion).toBe("0.113.1");
    expect(data.url).toBe("https://phux.sh");
  });

  test("omits softwareVersion when this build has no derived version", () => {
    const data = softwareApplication("https://docs.phux.sh", null);
    expect(data.url).toBe("https://docs.phux.sh");
    expect(data.softwareVersion).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("softwareVersion");
  });
});
