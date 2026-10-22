import { describe, expect, test } from "bun:test";
import { MAX_RESULTS, indexSections, rankSections, type SectionRecord } from "./search";

/**
 * Real sections from the built index (scripts/build-search.mjs over the phux
 * docs): link lists that summarise other pages, and the content sections
 * they point at.
 */
function docsSection(url: string, page: string, heading: string, text: string, linkShare = 0): SectionRecord {
  const [route, anchor] = url.split("#");
  const hash = anchor ? `#${anchor}` : "";
  return {
    url: `https://docs.phux.sh${route}${hash}`,
    markdown: `https://docs.phux.sh${route}.md${hash}`,
    page,
    heading,
    text,
    linkShare,
  };
}

const DOCS = [
  docsSection("/docs#customize", "All docs", "Customize", "Configuration file: where the file lives, how it layers over the defaults, and when a change takes effect. Key bindings: change the prefix, rebind or unbind keys, and see what's in effect. Themes: install, pick, and write colour themes. Status bar and sidebar: what the bar and the sidebar show, and how to change it. Hooks: run a command when something happens. Plugins: add actions, panes, and sidebar sections. Projects: open a project's session from a recipe in its repository.", 1),
  docsSection("/docs#machines-and-clients", "All docs", "Machines and clients", "Remote machines: reach another machine's server with phux host add, and link machines together. Clients: the terminal UI, the desktop app, the browser client, and phones. Desktop Quick Capture: start an agent from a thought without leaving what you're doing. Desktop Changes panel: review, stage, and commit the focused checkout. Desktop agent panes: how the desktop app shows agent panes.", 1),
  docsSection("/getting-started#detach-and-come-back", "Getting started", "Detach and come back", "Press C-a d to detach. The UI closes; your shells, and whatever runs in them, keep going. Run phux again, from this terminal or any other, to pick up where you left off. Losing an SSH connection is the same as detaching."),
  docsSection("/getting-started#keep-c-b", "Getting started", "Keep C-b", "Put this in ~/.config/phux/config.toml: Then reload with phux config reload. Key bindings covers rebinding and unbinding any key."),
  docsSection("/getting-started#next", "Getting started", "Next", "Concepts: sessions, tabs, panes, targets, and what survives a restart. Driving terminals from scripts: everything above, from a shell or a coding agent. Key bindings: make the keys your own. Remote machines: attach to a server on another machine.", 1),
  docsSection("/concepts#hosts", "Concepts", "Hosts", "A host is another machine running its own phux server that you've told this machine how to reach. There's no account and no hosted service in between. Remote machines covers setup and what each machine can see."),
  docsSection("/config#more", "Configuration file", "More", "Key bindings: change the prefix, rebind and unbind keys. Themes: install and pick colour themes, or recolour one part of the chrome. Status bar and sidebar: what the bar and sidebar show, and agent notifications. Hooks: run a command when something happens. Plugins: add actions, panes, widgets, and themes. Projects: open a repository's session from a recipe. Config reference: every section and setting.", 1),
  docsSection("/keys#the-prefix", "Key bindings", "The prefix", "Most phux keys are two presses: the prefix, C-a, then a key. C-a z zooms the focused pane, and C-a d detaches. Press the prefix and hesitate, and after 400 milliseconds a popup lists every key you can press next, your own bindings included. The popup never gets in the way: whatever you press runs as if it weren't there, and Esc cancels the prefix. Change the delay or turn the popup off: After the prefix, a key with no binding goes to the program in the pane; only the prefix itself is swallowed. So C-a C-a sends one literal C-a to the program, which is how you reach readline's beginning-of-line. Default key bindings lists every key phux binds out of the box, grouped the way the popup groups them."),
  docsSection("/keys#replacing-a-default", "Key bindings", "Replacing a default", "To change what a default key does, bind it. There is no need to unbind it first: Your binding replaces the shipped one for that key whole, arguments included, whatever spelling you use: \"S-x\" in your file replaces the shipped \"X\". Within one file, two spellings of the same key conflict. \"X\" and \"S-x\" in the same file is an error, and phux config check reports it."),
  docsSection("/keys#removing-a-binding", "Key bindings", "Removing a binding", "Set a key to \"none\" to remove its binding, a shipped default included: Unbinding a key gives it back to the program. An unbound global key goes straight to the program in the pane. An unbound prefix-table key goes to the program after the prefix, so C-a x now types an x. An unbound key stays unbound. A plugin whose manifest keys names it doesn't get it, whatever spelling either of you uses."),
  docsSection("/remote#adding-a-machine", "Remote machines", "Adding a machine", "Install phux on the remote machine, then run this on your own: Over ssh me@mini, this: Checks that phux is on the remote PATH. Installs a service there, so the server survives logouts and reboots. Sets the remote server's [policy] mode to \"paired\" and opens a QUIC listener on UDP port 8788. Issues a certificate and token for this machine. Saves the whole thing under the name mini in your config. There is nothing to copy by hand. Run phux host add me@mini again whenever the host stops answering: it checks the setup and repairs what broke. If a non-interactive SSH shell doesn't find phux on the remote machine, as with some Homebrew or Nix installs, say where it is: Option Does --name NAME Saves the machine under another name. --quic-port PORT Uses another UDP port than 8788. --endpoint HOST:PORT Registers this address instead of the ones found on the host. --no-service Starts the server without a service, so it won't come back after a reboot. --ssh-only Registers an ssh:// entry without contacting the host. --session NAME Attaches to this session on arrival."),
  docsSection("/themes#installing-a-theme", "Themes", "Installing a theme", "phux theme install takes a git URL or a local directory. The directory must hold colors.toml at its root. Nothing in a theme is ever run: The theme's name comes from the URL the way Omarchy names it: the last path segment without .git, an omarchy- or phux- prefix, or a -theme suffix. Installing the same name again replaces it. Themes are kept in $XDG_DATA_HOME/phux/themes, or ~/.local/share/phux/themes. Plugins can ship themes too. An enabled plugin's themes appear in the list beside the ones you installed; an installed theme wins over a plugin theme with the same name. marks the selected theme. phux theme remove NAME deletes an installed theme; to drop a plugin's theme, disable the plugin."),
  docsSection("/themes#selecting-a-theme", "Themes", "Selecting a theme", "Two keys in [theme] select a whole palette. Set one of them: file follows any colors.toml on disk. Pointing it at Omarchy's current theme, as above, makes phux follow the Omarchy theme switcher; run phux config reload after switching to repaint. phux theme set NAME and phux theme set --file PATH write these keys for you, remove the other one so exactly one selects, and signal a reload. Without a running server, attached clients pick it up the next time you attach. phux theme show prints the selected theme's resolved colours, or a named theme's with phux theme show NAME, along with the foreground on background contrast ratio. It flags a ratio below 4.5:1, the WCAG AA minimum for body text."),
];

describe("ranking real docs", () => {
  const index = indexSections(DOCS);
  const top = (query: string, count = 3) =>
    rankSections(index, query, count).map((result) => result.url.replace("https://docs.phux.sh", ""));

  test("unbind key: the section on removing a binding, above the link lists that mention it", () => {
    const results = top("unbind key", MAX_RESULTS);
    expect(results[0]).toBe("/keys#removing-a-binding");
    expect(results.indexOf("/keys#removing-a-binding")).toBeLessThan(results.indexOf("/config#more"));
    expect(results.indexOf("/keys#removing-a-binding")).toBeLessThan(results.indexOf("/docs#customize"));
  });

  test("change prefix: the prefix section first, ahead of the link lists", () => {
    expect(top("change prefix")[0]).toBe("/keys#the-prefix");
  });

  test("detach: the section that explains detaching", () => {
    expect(top("detach")[0]).toBe("/getting-started#detach-and-come-back");
    expect(top("detach")).not.toContain("/getting-started#next");
  });

  test("remote host: hosts and adding a machine, ahead of the index", () => {
    const results = top("remote host");
    expect(results.slice(0, 2).sort()).toEqual(["/concepts#hosts", "/remote#adding-a-machine"]);
  });

  test("theme: the themes page's own sections", () => {
    const results = top("theme");
    expect(results.slice(0, 2).sort()).toEqual(["/themes#installing-a-theme", "/themes#selecting-a-theme"]);
  });

  test("a link list ranks below content that matches as well, whatever the index order", () => {
    const text = "Key bindings: change the prefix, rebind and unbind keys.";
    const links = docsSection("/a#more", "A", "More", text, 1);
    const content = docsSection("/b#other", "B", "Other", text);
    expect(rankSections(indexSections([links, content]), "unbind key").map((r) => r.page)).toEqual(["B", "A"]);
    // An index built before linkShare existed ranks every section as content.
    const { linkShare: _, ...unhinted } = links;
    expect(rankSections(indexSections([unhinted, content]), "unbind key").map((r) => r.page)).toEqual(["A", "B"]);
  });

  test("a phrase match skips stopwords in the text, as the query does", () => {
    const apart = docsSection("/a#one", "A", "One", "unbind it, then press any key");
    const phrase = docsSection("/b#two", "B", "Two", "unbinding a key");
    expect(rankSections(indexSections([apart, phrase]), "unbind key")[0]?.page).toBe("B");
  });

  test("ranking hints are never served", () => {
    for (const result of rankSections(index, "key")) {
      expect(Object.keys(result).sort()).toEqual(["heading", "markdown", "page", "text", "url"]);
    }
  });
});
