import { describe, expect, test } from "bun:test";
import { APACHE_LICENSE, SHIPPED_OPERATING_SYSTEM, SOFTWARE_ID, softwareApplication } from "../src/lib/software-application";
import { SITE } from "../src/lib/site";

describe("SoftwareApplication JSON-LD", () => {
  test("names the shipped systems, the Apache license, and a zero price", () => {
    const data = softwareApplication("0.113.1");
    const [application, source] = data["@graph"];
    expect(application?.["@type"]).toBe("SoftwareApplication");
    expect(application?.["@id"]).toBe(SOFTWARE_ID);
    expect(application?.["@id"]).toBe("https://phux.sh/#software");
    expect(application?.name).toBe("phux");
    expect(application?.description).toBe(SITE.tagline);
    expect(application?.applicationCategory).toBe("DeveloperApplication");
    expect(application?.operatingSystem).toBe(SHIPPED_OPERATING_SYSTEM);
    expect(application?.operatingSystem).toBe("macOS (Apple silicon), Linux, Windows (native desktop with WSL 2 server; CLI/TUI in WSL 2)");
    expect(application?.license).toBe(APACHE_LICENSE);
    expect(application?.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "USD" });
    expect(application).not.toHaveProperty("codeRepository");
    expect(application?.url).toBe("https://phux.sh");
    expect(application?.softwareVersion).toBe("0.113.1");
    expect(source).toEqual({
      "@type": "SoftwareSourceCode",
      codeRepository: "https://github.com/no-phux/phux",
      url: "https://github.com/no-phux/phux",
      targetProduct: { "@id": "https://phux.sh/#software" },
    });
    expect(JSON.stringify(data)).not.toContain("programmable terminal runtime");
  });

  test("omits softwareVersion when this build has no derived version", () => {
    const data = softwareApplication(null);
    const application = data["@graph"][0];
    expect(application?.url).toBe(SITE.url);
    expect(application?.softwareVersion).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("softwareVersion");
  });
});
