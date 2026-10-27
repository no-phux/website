// Per-URL sitemap dates. One `git log -1` for the whole repo stamps every URL
// with the tip commit, and a shallow checkout makes that true even per file.
// Omit lastmod when the file's own date is not knowable.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { phuxRoot } from "./phux-root";

const shallow = new Map<string, boolean>();

export function repositoryShallow(repo: string): boolean {
  const cached = shallow.get(repo);
  if (cached !== undefined) return cached;
  let value = true;
  try {
    value = execFileSync("git", ["-C", repo, "rev-parse", "--is-shallow-repository"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "true";
  } catch {
    value = true;
  }
  shallow.set(repo, value);
  return value;
}

/** Committer date of `file` in `repo`, or undefined when history cannot say. */
export function sourceLastmod(repo: string, file: string): string | undefined {
  if (repositoryShallow(repo)) return undefined;
  try {
    const date = execFileSync("git", ["-C", repo, "log", "-1", "--format=%cI", "--", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return date || undefined;
  } catch {
    return undefined;
  }
}

export function frontmatterValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}: "((?:\\\\.|[^"\\\\])*)"`, "m"));
  if (!match?.[1]) return undefined;
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** pathname → ISO-8601 committer date. Missing entries are left out of the sitemap. */
export function pageLastmods(siteRoot: string): Map<string, string> {
  const dates = new Map<string, string>();
  let docsRoot: string | undefined;
  try {
    docsRoot = phuxRoot(siteRoot);
  } catch {
    docsRoot = undefined;
  }
  const synced = join(siteRoot, "src/content/docs/_synced");
  for (const file of walk(synced)) {
    if (!file.endsWith(".md")) continue;
    const text = readFileSync(file, "utf8");
    const sourcePath = frontmatterValue(text, "sourcePath");
    if (!sourcePath) continue;
    const sourceBase = frontmatterValue(text, "sourceBase") ?? "";
    const website = sourceBase.includes("github.com/no-phux/website") || sourcePath.startsWith("src/");
    const repo = website ? siteRoot : docsRoot;
    if (!repo) continue;
    const date = sourceLastmod(repo, sourcePath);
    if (!date) continue;
    const slug = relative(synced, file).replace(/\\/g, "/").replace(/\.md$/, "").replace(/\/index$/, "");
    dates.set(`/${slug}`, date);
  }
  for (const file of walk(join(siteRoot, "src/pages"))) {
    if (!file.endsWith(".astro") || file.includes("[")) continue;
    const rel = relative(join(siteRoot, "src/pages"), file).replace(/\\/g, "/").replace(/\.astro$/, "");
    const pathname = rel === "index" ? "/" : `/${rel.replace(/\/index$/, "")}`;
    if (dates.has(pathname)) continue;
    const date = sourceLastmod(siteRoot, relative(siteRoot, file));
    if (date) dates.set(pathname, date);
  }
  const demos = join(siteRoot, "src/content/demos");
  for (const file of walk(demos)) {
    if (!file.endsWith(".md")) continue;
    const slug = relative(demos, file).replace(/\\/g, "/").replace(/\.md$/, "");
    const date = sourceLastmod(siteRoot, relative(siteRoot, file));
    if (date) dates.set(`/demos/${slug}`, date);
  }
  return dates;
}
