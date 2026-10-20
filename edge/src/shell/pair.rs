//! The demo's `phux pair` command: the session's single-use attach link,
//! rendered as the QR a camera scans.

use serde::Deserialize;

use super::Shell;
use super::{BOLD, CYAN, DIM, RESET};

/// The command waiting at the prompt: the real CLI spelling for the real
/// pairing flow, so pressing Enter is the whole demo.
pub(super) const PAIR_PREFILL: &str = "phux pair";

/// The pairing material the Worker hands the shell for this session: the page
/// a scanned code opens. The shell renders the QR itself, on demand, like
/// `phux pair` does on a real host.
#[derive(Debug, Deserialize)]
pub(super) struct PairContext {
    link: String,
}

#[derive(Debug, Deserialize)]
struct SessionContext {
    #[serde(default)]
    pair: Option<PairContext>,
}

/// The pairing link a demo session was handed, if any. Only the live demo
/// gets one; the portfolio and native-fallback shells ignore the context.
pub(super) fn from_context(mode: &str, snapshot_json: &str) -> Option<PairContext> {
    (mode == "demo")
        .then(|| serde_json::from_str::<SessionContext>(snapshot_json).ok())
        .flatten()
        .and_then(|context| context.pair)
        .filter(|pair| !pair.link.is_empty())
}

impl Shell {
    /// `phux pair` in the demo shell: the real command name and the real
    /// artifact (a scannable QR for this session's pairing link), rendered
    /// from the link the Worker minted for the view that opened the shell.
    pub(super) fn pair_command(&self, args: &[&str]) -> String {
        let Some(pair) = &self.pair else {
            return "phux pair: this hosted shell has no pairing link\r\n".to_owned();
        };
        let qr_only = args.contains(&"--qr");
        let no_qr = args.contains(&"--no-qr");
        if qr_only && no_qr {
            return "phux pair: --qr and --no-qr cannot combine\r\n".to_owned();
        }
        if args.iter().any(|arg| *arg != "--qr" && *arg != "--no-qr") {
            return "phux pair: this demo supports --qr and --no-qr\r\n".to_owned();
        }

        let mut out = String::new();
        if !qr_only {
            out.push_str(&format!(
                "{BOLD}Pair your phone{RESET} {DIM}· scan with a camera · one use, five minutes{RESET}\r\n"
            ));
            out.push_str(&format!("  {CYAN}{}{RESET}\r\n", pair.link));
        }
        if !no_qr {
            match pair_qr(&pair.link) {
                Ok(qr) => out.push_str(&qr),
                Err(err) => out.push_str(&format!("phux pair: {err}\r\n")),
            }
        }
        out
    }
}

/// Render `link` as a compact half-block QR on white paper. The ANSI pair is
/// deliberate: a dark terminal would otherwise print an inverted code, which
/// some cameras refuse. The quiet zone is two modules rather than the
/// renderer's four so the code, its link, and the prompt still fit a 24-row
/// demo terminal; on a clean screen that margin scans.
fn pair_qr(link: &str) -> Result<String, String> {
    use qrcode::QrCode;
    use qrcode::render::unicode;

    let code = QrCode::new(link.as_bytes())
        .map_err(|err| format!("could not encode the pairing QR: {err}"))?;
    let rendered = code
        .render::<unicode::Dense1x2>()
        .quiet_zone(false)
        .module_dimensions(1, 1)
        .build();
    let width = rendered
        .lines()
        .next()
        .map_or(0, |line| line.chars().count());
    let blank = " ".repeat(width + 4);
    let mut out = String::new();
    out.push_str(&format!("  \x1b[47m{blank}\x1b[0m\r\n"));
    for line in rendered.lines() {
        out.push_str(&format!("  \x1b[47m\x1b[30m  {line}  \x1b[0m\r\n"));
    }
    out.push_str(&format!("  \x1b[47m{blank}\x1b[0m\r\n"));
    Ok(out)
}
