//! A curated demo shell: turns keystrokes into VT output bytes. No OS, no
//! processes — a small line editor + command interpreter over an in-memory FS,
//! so it runs anywhere (a Durable Object, the browser, a test). The browser's
//! libghostty-vt engine renders whatever bytes this emits.

mod pair;
mod portfolio;
mod showcase;
#[cfg(test)]
mod tests;

use phux_protocol::input::key::{KeyAction, KeyEvent, ModSet, PhysicalKey};
use serde::{Deserialize, Serialize};

use pair::{PAIR_PREFILL, PairContext, from_context as pair_context};
use portfolio::PortfolioShell;
use showcase::{glass_workspace, run};

const MAX_INPUT_LINE_BYTES: usize = 4096;

// SGR / control sequences.
const RESET: &str = "\x1b[0m";
const VIOLET: &str = "\x1b[38;5;141m"; // flux violet
const CYAN: &str = "\x1b[38;5;80m"; // signal cyan
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";
const ICE: &str = "\x1b[38;2;169;198;217m";
const QUIET_ICE: &str = "\x1b[38;2;133;164;186m";

/// A curated, OS-less shell. Owns the current input line and a tiny FS.
pub struct Shell {
    line: String,
    glass: bool,
    portfolio: Option<PortfolioShell>,
    pair: Option<PairContext>,
    /// The line is the untouched `phux pair` suggestion: the first real
    /// keystroke replaces it instead of appending to it.
    prefilled: bool,
}

impl Shell {
    pub fn new(mode: &str, snapshot_json: &str) -> Self {
        let pair = pair_context(mode, snapshot_json);
        let prefilled = pair.is_some();
        Self {
            line: if prefilled {
                PAIR_PREFILL.to_owned()
            } else {
                String::new()
            },
            glass: false,
            portfolio: (mode == "portfolio" || mode == "native-fallback")
                .then(|| PortfolioShell::new(snapshot_json, mode == "native-fallback")),
            pair,
            prefilled,
        }
    }

    /// New split resources inherit only presentation, never pending user input.
    pub fn inherit_presentation(&mut self, parent: &Self) {
        self.glass = parent.glass;
    }

    /// The prompt string (on its own, no leading newline).
    fn prompt(&self) -> String {
        if self.glass {
            return format!("{QUIET_ICE}›{RESET} ");
        }
        format!("{VIOLET}phux{RESET} {DIM}demo{RESET} $ ")
    }

    /// Bytes to paint on attach: a welcome banner, then the first prompt.
    pub fn greeting(&self) -> Vec<u8> {
        if let Some(portfolio) = &self.portfolio {
            return portfolio.render().into_bytes();
        }
        if self.glass {
            return format!("{}{}{}", glass_workspace(), self.prompt(), self.line).into_bytes();
        }
        let mut o = String::new();
        o.push_str("\x1b[2J\x1b[H"); // clear + home
        o.push_str(&format!("  {VIOLET}{BOLD}Welcome to phux.{RESET}\r\n"));
        if self.pair.is_some() {
            o.push_str(&format!(
                "  Press {BOLD}Enter{RESET} to print a QR and open this shell on your phone.\r\n"
            ));
        }
        o.push_str(&format!(
            "  Type {BOLD}help{RESET} to explore, then split a pane.\r\n\r\n"
        ));
        o.push_str(&self.prompt());
        o.push_str(&self.line);
        o.into_bytes()
    }

    /// Process one key event; return the VT bytes to emit (may be empty).
    pub fn input(&mut self, ev: &KeyEvent) -> Vec<u8> {
        if ev.action == KeyAction::Release {
            return Vec::new();
        }

        if let Some(portfolio) = &mut self.portfolio {
            return portfolio.input(ev).into_bytes();
        }

        // Ctrl-C: abandon the line.
        if ev.mods.contains(ModSet::CTRL) && ev.key == PhysicalKey::C {
            self.line.clear();
            self.prefilled = false;
            return format!("^C\r\n{}", self.prompt()).into_bytes();
        }
        // Ctrl-L: clear screen, keep the line.
        if ev.mods.contains(ModSet::CTRL) && ev.key == PhysicalKey::L {
            return format!("\x1b[2J\x1b[H{}{}", self.prompt(), self.line).into_bytes();
        }

        match ev.key {
            PhysicalKey::Enter | PhysicalKey::NumpadEnter => self.submit_line(),
            PhysicalKey::Backspace | PhysicalKey::NumpadBackspace => {
                if self.prefilled {
                    // The suggestion is not a half-typed command: the first
                    // edit starts from an empty prompt.
                    self.prefilled = false;
                    self.line.clear();
                    return format!("\r\x1b[2K{}", self.prompt()).into_bytes();
                }
                if self.line.pop().is_some() {
                    b"\x08 \x08".to_vec() // erase one cell
                } else {
                    Vec::new()
                }
            }
            _ => {
                // Printable input: the client fills `text` for single, non-Ctrl
                // characters. Echo it and buffer it.
                if let Some(t) = ev.text.as_deref()
                    && !t.is_empty()
                    && !ev.mods.contains(ModSet::CTRL)
                    && !ev.mods.contains(ModSet::SUPER)
                    && (if self.prefilled { 0 } else { self.line.len() }).saturating_add(t.len())
                        <= MAX_INPUT_LINE_BYTES
                {
                    if self.prefilled {
                        self.prefilled = false;
                        self.line.clear();
                        self.line.push_str(t);
                        return format!("\r\x1b[2K{}{}", self.prompt(), t).into_bytes();
                    }
                    self.line.push_str(t);
                    return t.as_bytes().to_vec();
                }
                Vec::new()
            }
        }
    }

    fn submit_line(&mut self) -> Vec<u8> {
        self.prefilled = false;
        let line = std::mem::take(&mut self.line);
        let output = self.execute(line.trim());
        format!("\r\n{output}{}", self.prompt()).into_bytes()
    }

    fn execute(&mut self, line: &str) -> String {
        let words: Vec<_> = line.split_whitespace().collect();
        match words.as_slice() {
            ["demo", "glass" | "workspace"] => {
                self.glass = true;
                glass_workspace()
            }
            ["theme", "glass"] => {
                self.glass = true;
                "\x1b[2J\x1b[H".to_owned()
            }
            ["theme", "default"] => {
                self.glass = false;
                "\x1b[2J\x1b[H".to_owned()
            }
            ["theme", ..] => "theme: choose glass or default\r\n".to_owned(),
            ["phux", "pair", args @ ..] => self.pair_command(args),
            _ => run(line),
        }
    }

    /// Validate before mutation, so rejected input never partially edits a line.
    pub fn validate_key(&self, event: &KeyEvent) -> Result<(), String> {
        if event.action == KeyAction::Release || event.mods.intersects(ModSet::CTRL | ModSet::SUPER)
        {
            return Ok(());
        }
        if let Some(text) = event.text.as_deref() {
            self.validate_text(text)?;
        }
        Ok(())
    }

    fn validate_text(&self, text: &str) -> Result<(), String> {
        if text.chars().any(char::is_control) {
            return Err("input must be printable text".to_owned());
        }
        // A prefilled suggestion is replaced, not extended, by the first edit.
        let base = if self.prefilled { 0 } else { self.line.len() };
        if base.saturating_add(text.len()) > MAX_INPUT_LINE_BYTES {
            return Err("input line exceeds 4096 bytes".to_owned());
        }
        Ok(())
    }

    /// Paste edits the same line as keys; explicit newlines submit commands.
    /// The caller rejects unsafe untrusted control characters before this call.
    pub fn paste(&mut self, text: &str) -> Result<Vec<u8>, String> {
        if self.portfolio.is_some() {
            return Err(
                "paste is available in the demo shell, not the portfolio navigator".to_owned(),
            );
        }
        let text = text
            .replace("\r\n", "\n")
            .replace('\r', "\n")
            .replace('\t', " ");
        if text.chars().any(|c| c.is_control() && c != '\n') {
            return Err("paste contains unsupported control characters".to_owned());
        }
        let mut lines = text.split('\n');
        self.validate_text(lines.next().unwrap_or(""))?;
        for line in lines {
            if line.len() > MAX_INPUT_LINE_BYTES {
                return Err("pasted line exceeds 4096 bytes".to_owned());
            }
        }
        let mut output = Vec::new();
        if self.prefilled {
            self.prefilled = false;
            self.line.clear();
            output.extend_from_slice(format!("\r\x1b[2K{}", self.prompt()).as_bytes());
        }
        for segment in text.split_inclusive('\n') {
            let line = segment.strip_suffix('\n').unwrap_or(segment);
            self.line.push_str(line);
            output.extend_from_slice(line.as_bytes());
            if segment.ends_with('\n') {
                output.extend(self.submit_line());
            }
        }
        Ok(output)
    }

    pub fn checkpoint(&self) -> ShellCheckpoint {
        match &self.portfolio {
            Some(portfolio) => ShellCheckpoint::Portfolio {
                selected: portfolio.selected,
                detail: portfolio.detail,
            },
            None => ShellCheckpoint::Demo {
                line: self.line.clone(),
                glass: self.glass,
            },
        }
    }

    pub fn restore(&mut self, checkpoint: ShellCheckpoint) -> Result<(), String> {
        match (checkpoint, &mut self.portfolio) {
            (ShellCheckpoint::Demo { line, glass }, None) => {
                if line.len() > MAX_INPUT_LINE_BYTES || line.chars().any(char::is_control) {
                    return Err("checkpoint input line is invalid".to_owned());
                }
                self.prefilled = self.pair.is_some() && line == PAIR_PREFILL;
                self.line = line;
                self.glass = glass;
                Ok(())
            }
            (ShellCheckpoint::Portfolio { selected, detail }, Some(portfolio)) => {
                let count = portfolio.repo_count();
                if (count == 0 && selected != 0) || (count > 0 && selected >= count) {
                    return Err("portfolio selection is out of range".to_owned());
                }
                if count == 0 && detail {
                    return Err("portfolio detail requires a repository".to_owned());
                }
                portfolio.selected = selected;
                portfolio.detail = detail;
                Ok(())
            }
            _ => Err("checkpoint shell kind does not match mode".to_owned()),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ShellCheckpoint {
    Demo {
        line: String,
        #[serde(default, skip_serializing_if = "is_false")]
        glass: bool,
    },
    Portfolio {
        selected: usize,
        detail: bool,
    },
}

fn is_false(value: &bool) -> bool {
    !*value
}
