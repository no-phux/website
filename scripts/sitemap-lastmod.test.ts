import { describe, expect, test } from "bun:test";
import { frontmatterValue, repositoryShallow, sourceLastmod } from "./sitemap-lastmod";

const page = `---
title: "Install"
sourcePath: "docs/install.md"
sourceBase: "https://github.com/no-phux/phux"
---
`;

describe("sitemap lastmod", () => {
  test("reads the quoted source path from synced frontmatter", () => {
    expect(frontmatterValue(page, "sourcePath")).toBe("docs/install.md");
    expect(frontmatterValue(page, "missing")).toBeUndefined();
    expect(frontmatterValue('sourcePath: "say \\"hi\\""', "sourcePath")).toBe('say "hi"');
  });

  test("a missing or shallow repository yields no date", () => {
    expect(repositoryShallow("/tmp/not-a-git-repo")).toBe(true);
    expect(sourceLastmod("/tmp/not-a-git-repo", "docs/install.md")).toBeUndefined();
  });
});
