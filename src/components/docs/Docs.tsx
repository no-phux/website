import { useCallback, useState, type ReactNode } from "react";
import { navigate } from "astro:transitions/client";
import { RootProvider } from "fumadocs-ui/provider/astro";
import type { AstroProviderProps } from "fumadocs-core/framework/astro";
import { findNeighbour, type Item, type Root } from "fumadocs-core/page-tree";
import { AnchorProvider, type TOCItemType } from "fumadocs-core/toc";
import { SITE } from "../../lib/site";
import SearchDialogComponent from "./search";
import { CodeControls } from "./CodeControls";
import { NavigationDrawer, ReaderTheme, SearchButton, useSlashSearch } from "./ReaderControls";
import { ReaderNav } from "./ReaderNav";
import { PageActions } from "./PageActions";
import { MenuIcon } from "./icons";

interface Props {
  tree: Root;
  children: ReactNode;
  pathname: string;
  params: AstroProviderProps["params"];
  toc?: TOCItemType[];
  sourceUrl?: string;
  title: string;
  summary: string;
  description: string;
  stability: "stable" | "evolving" | "draft";
  protocolVersion: string;
}

const NO_TOC: TOCItemType[] = [];

export function Docs(props: Props) {
  return (
    <RootProvider
      pathname={props.pathname}
      params={props.params}
      navigate={navigate}
      theme={{ defaultTheme: "system", enableSystem: true, disableTransitionOnChange: true, hotKey: false }}
      search={{ SearchDialog: SearchDialogComponent }}
    >
      <ReaderShell {...props} />
    </RootProvider>
  );
}

function Brand() {
  return (
    <a className="reader-brand" href="/overview">
      {SITE.name} <span>docs</span>
    </a>
  );
}

function SidebarFoot() {
  return (
    <div className="reader-sidebar-foot">
      <ReaderTheme />
      <p>
        <a href="/llms.txt">llms.txt</a>
        <a href={SITE.github} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href={SITE.url}>{SITE.domain}</a>
      </p>
    </div>
  );
}

function ReaderShell({
  tree, children, pathname, toc = NO_TOC, sourceUrl,
  title, summary, description, stability, protocolVersion,
}: Props) {
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useSlashSearch();
  const isOverview = pathname.replace(/\/$/, "") === "/overview";
  const isProtocol = pathname === "/protocol" || pathname.startsWith("/protocol/");
  const lead = summary || description;

  return (
    <AnchorProvider toc={toc} single>
      <div className="reader">
        <header className="reader-bar">
          <button type="button" className="reader-icon-button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <MenuIcon />
          </button>
          <Brand />
          <SearchButton compact />
        </header>

        <aside className="reader-sidebar" data-reader-scroll="">
          <Brand />
          <SearchButton />
          <nav aria-label="Documentation">
            <ReaderNav tree={tree} pathname={pathname} toc={toc} />
          </nav>
          <SidebarFoot />
        </aside>

        <NavigationDrawer open={drawer} onClose={closeDrawer}>
          <nav aria-label="Documentation">
            <ReaderNav tree={tree} pathname={pathname} toc={toc} onNavigate={closeDrawer} />
          </nav>
          <SidebarFoot />
        </NavigationDrawer>

        <main id="docs-main" className="reader-main" tabIndex={-1}>
          <article className="reader-article">
            <header className="reader-header">
              <div className="reader-title-row">
                <h1>{title}</h1>
                <PageActions key={pathname} pathname={pathname} sourceUrl={sourceUrl} />
              </div>
              {lead && <p className="reader-lead">{lead}</p>}
            </header>
            <div className={isOverview ? "reader-overview" : "prose reader-prose"}>{children}</div>
            {!isOverview && <CodeControls pathname={pathname} />}
            <PageFooter tree={tree} pathname={pathname} stability={stability} wire={isProtocol ? protocolVersion : ""} />
          </article>
        </main>
      </div>
    </AnchorProvider>
  );
}

function Neighbour({ item, rel }: { item?: Item; rel: "prev" | "next" }) {
  if (!item) return <span />;
  return (
    <a className={`reader-pager-${rel}`} href={item.url} rel={rel}>
      <span>{rel === "prev" ? "Previous" : "Next"}</span>
      {item.name}
    </a>
  );
}

function PageFooter({ tree, pathname, stability, wire }: { tree: Root; pathname: string; stability: string; wire: string }) {
  const { previous, next } = findNeighbour(tree, pathname);
  return (
    <footer className="reader-footer">
      {(previous || next) && (
        <nav className="reader-pager" aria-label="Previous and next pages">
          <Neighbour item={previous} rel="prev" />
          <Neighbour item={next} rel="next" />
        </nav>
      )}
      <p className="reader-meta">
        {stability !== "stable" && <span>{stability} document</span>}
        {wire && <span>Wire {wire}</span>}
        <a href={`${SITE.url}/privacy`}>Privacy</a>
        <a href={`${SITE.url}/support`}>Support</a>
        <span>© 2026 no-phux</span>
      </p>
    </footer>
  );
}
