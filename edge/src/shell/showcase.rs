//! The curated command set: help, the tiny in-memory filesystem, and the
//! truecolor / hyperlink showcase. Pure text in, VT bytes out.

use super::{BOLD, CYAN, DIM, ICE, QUIET_ICE, RESET, VIOLET};

/// Run a command line; return its VT output (commands end their own lines).
pub(super) fn run(line: &str) -> String {
    if line.is_empty() {
        return String::new();
    }
    let mut parts = line.split_whitespace();
    let cmd = parts.next().unwrap_or("");
    let args: Vec<&str> = parts.collect();

    match cmd {
        "help" => help(),
        "ls" => fs_list(),
        "cat" => cat(&args),
        "pwd" => "/home/guest/phux\r\n".to_owned(),
        "echo" => format!("{}\r\n", args.join(" ")),
        "whoami" => "guest\r\n".to_owned(),
        "uname" => "phux-edge (wasm) · Cloudflare Durable Object\r\n".to_owned(),
        "clear" => "\x1b[2J\x1b[H".to_owned(),
        "date" => "a fine day on the wire\r\n".to_owned(),
        "demo" => demo(&args),
        "" => String::new(),
        other => format!("phux: {other}: command not found\r\n"),
    }
}

fn help() -> String {
    format!(
        "{BOLD}phux demo shell{RESET} — a curated, OS-less terminal on the edge.\r\n\
         \r\n\
         {BOLD}phux pair{RESET}   print a QR for this shell on your phone\r\n\
         {BOLD}demo{RESET}        the showcase: logo, truecolor, hyperlinks\r\n\
         {BOLD}demo links{RESET}  OSC 8 hyperlinks + 24-bit truecolor\r\n\
         {BOLD}demo glass{RESET}  a compact workspace + minimal prompt\r\n\
         {BOLD}theme glass / default{RESET}  choose the prompt\r\n\
         {BOLD}ls / cat{RESET}    poke around a tiny in-memory filesystem\r\n\
         {BOLD}echo / pwd / whoami / uname / clear{RESET}\r\n\
         \r\n\
         {DIM}every byte here crosses the real phux wire — the browser renders\r\n\
         it with the same libghostty engine native phux uses.{RESET}\r\n"
    )
}

// ── a tiny in-memory filesystem ──────────────────────────────────────────────
const FILES: &[(&str, &str)] = &[
    (
        "README",
        "phux — a terminal is an object you spawn, observe, and drive over a wire.\r\n\
         This demo runs that wire end-to-end, with the server living in a\r\n\
         Cloudflare Durable Object (WASM) instead of a container.\r\n",
    ),
    (
        "the-wire.txt",
        "The same libghostty-vt engine runs on both ends, so Kitty graphics,\r\n\
         OSC 8 hyperlinks, sixel, and 24-bit color pass through untouched.\r\n",
    ),
];

fn fs_list() -> String {
    let mut names: Vec<&str> = FILES.iter().map(|(n, _)| *n).collect();
    names.sort_unstable();
    format!("{}\r\n", names.join("   "))
}

fn cat(args: &[&str]) -> String {
    let Some(name) = args.first() else {
        return "cat: missing file operand\r\n".to_owned();
    };
    FILES.iter().find(|(n, _)| n == name).map_or_else(
        || format!("cat: {name}: No such file\r\n"),
        |(_, c)| (*c).to_owned(),
    )
}

/// Intentional server output for an opt-in live glass workspace. This describes
/// the real edge multiplexer/view contract, without claiming native processes.
pub(super) fn glass_workspace() -> String {
    format!(
        "\x1b[2J\x1b[H{ICE}phux / workspace{RESET}\r\n\
        one session\r\n\
        independent panes\r\n\
        {QUIET_ICE}echo hello · ls · help{RESET}\r\n"
    )
}

// ── the showcase ─────────────────────────────────────────────────────────────
fn logo() -> String {
    format!("  {VIOLET}{BOLD}▟█▙  phux{RESET}  {DIM}terminal control plane{RESET}\r\n")
}

fn demo(args: &[&str]) -> String {
    match args.first().copied() {
        Some("links") => links(),
        Some("colors") => format!("{}\r\n", truecolor_bar()),
        Some("logo") => format!("{}\r\n", logo()),
        _ => {
            // `demo` / `demo all`
            let mut o = String::new();
            o.push_str(&logo());
            o.push_str("\r\n");
            o.push_str(&links());
            o
        }
    }
}

fn truecolor_bar() -> String {
    let mut s = String::from("  truecolor: ");
    for i in 0..40u32 {
        let r = 40 + i * 5;
        let g = 20 + i * 3;
        let b = (90 + i * 4).min(255);
        s.push_str(&format!("\x1b[48;2;{r};{g};{b}m \x1b[0m"));
    }
    s
}

fn links() -> String {
    let osc8 =
        |url: &str, text: &str| format!("\x1b]8;;{url}\x1b\\\x1b[4m{text}\x1b[24m\x1b]8;;\x1b\\");
    format!(
        "  {BOLD}OSC 8 hyperlinks + truecolor — passed through, not re-implemented:{RESET}\r\n\
         \r\n\
         {CYAN}  {}{RESET}\r\n\
         {CYAN}  {}{RESET}\r\n\
         {}\r\n",
        osc8("https://phux.sh", "phux.sh"),
        osc8("https://github.com/no-phux/phux", "github.com/no-phux/phux"),
        truecolor_bar(),
    )
}
