import { useEffect, useRef, type ReactNode } from "react";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import { TOCItem, useActiveAnchor, type TOCItemType } from "fumadocs-core/toc";

interface NavProps {
  tree: Root;
  pathname: string;
  toc: TOCItemType[];
  /** Called after a link is followed, so a drawer can close. */
  onNavigate?: () => void;
}

interface Group {
  label?: ReactNode;
  nodes: Node[];
}

/** Catalog separators become quiet, always-open group labels. */
function groups(nodes: Node[]): Group[] {
  const out: Group[] = [];
  for (const node of nodes) {
    if (node.type === "separator") out.push({ label: node.name, nodes: [] });
    else {
      if (out.length === 0) out.push({ nodes: [] });
      out[out.length - 1]!.nodes.push(node);
    }
  }
  return out.filter((group) => group.nodes.length > 0);
}

function samePath(url: string, pathname: string) {
  return url.replace(/\/$/, "") === pathname.replace(/\/$/, "");
}

/**
 * The active page's outline. H2s always; H3s too while the outline stays
 * short enough to scan. Long generated references keep only their H2s.
 */
export function outline(toc: TOCItemType[]): TOCItemType[] {
  const sections = toc.filter((item) => item.depth <= 3);
  return sections.length <= 24 ? sections : toc.filter((item) => item.depth === 2);
}

export function ReaderNav({ tree, pathname, toc, onNavigate }: NavProps) {
  const items = outline(toc);
  return (
    <div className="reader-nav" onClick={(event) => {
      if (onNavigate && (event.target as HTMLElement).closest("a")) onNavigate();
    }}>
      {groups(tree.children).map((group, index) => {
        const id = `reader-nav-group-${index}`;
        return (
          <section className="reader-nav-group" key={id}>
            {group.label && <p className="reader-nav-label" id={id}>{group.label}</p>}
            <ul aria-labelledby={group.label ? id : undefined}>
              {group.nodes.map((node) => (
                <NavNode key={node.$id ?? String(node.name)} node={node} pathname={pathname} toc={items} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function NavNode({ node, pathname, toc }: { node: Node; pathname: string; toc: TOCItemType[] }) {
  if (node.type === "separator") return null;
  if (node.type === "folder") return <NavFolder folder={node} pathname={pathname} toc={toc} />;
  return <NavPage page={node} pathname={pathname} toc={toc} />;
}

function NavFolder({ folder, pathname, toc }: { folder: Folder; pathname: string; toc: TOCItemType[] }) {
  return (
    <li className="reader-nav-folder">
      {folder.index
        ? <NavPage page={folder.index} pathname={pathname} toc={toc} />
        : <span className="reader-nav-folder-name">{folder.name}</span>}
      <ul>
        {folder.children.map((child) => (
          <NavNode key={child.$id ?? String(child.name)} node={child} pathname={pathname} toc={toc} />
        ))}
      </ul>
    </li>
  );
}

function NavPage({ page, pathname, toc }: { page: Item; pathname: string; toc: TOCItemType[] }) {
  const active = samePath(page.url, pathname);
  return (
    <li>
      <a
        className="reader-nav-link"
        href={page.url}
        aria-current={active ? "page" : undefined}
        data-active={active}
        {...(page.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {page.name}
      </a>
      {active && toc.length > 0 && <PageOutline toc={toc} />}
    </li>
  );
}

/** The page TOC, nested under its page link and scroll-spied. */
function PageOutline({ toc }: { toc: TOCItemType[] }) {
  const list = useRef<HTMLUListElement>(null);
  const active = useActiveAnchor();

  // Keep the section in view visible, without dragging the sidebar on every scroll.
  useEffect(() => {
    const link = active ? list.current?.querySelector<HTMLElement>(`a[href="#${CSS.escape(active)}"]`) : null;
    const scroller = link?.closest<HTMLElement>("[data-reader-scroll]");
    if (!link || !scroller) return;
    const box = link.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (box.top < view.top + 24 || box.bottom > view.bottom - 24) link.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <ul className="reader-outline" ref={list} aria-label="On this page">
      {toc.map((item) => (
        <li key={item.url} data-depth={item.depth}>
          <TOCItem href={item.url} autoScroll={false} className="reader-outline-link">
            {item.title}
          </TOCItem>
        </li>
      ))}
    </ul>
  );
}
