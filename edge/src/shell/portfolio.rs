//! The portfolio navigator: a read-only list of the product's public
//! repositories, rendered from the snapshot the Worker fetched.

use phux_protocol::input::key::{KeyEvent, PhysicalKey};
use serde::Deserialize;

use super::{BOLD, DIM, RESET, VIOLET};

#[derive(Deserialize, Default)]
struct PortfolioSnapshot {
    #[serde(default)]
    fetched_at: String,
    #[serde(default)]
    repos: Vec<PortfolioRepo>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct PortfolioRepo {
    name: String,
    description: Option<String>,
    url: String,
    homepage: Option<String>,
    language: Option<String>,
    stars: u64,
    forks: u64,
    open_issues: u64,
    pushed_at: String,
    latest_run: Option<PortfolioRun>,
}

#[derive(Deserialize)]
struct PortfolioRun {
    workflow: String,
    branch: String,
    status: String,
    conclusion: Option<String>,
    url: String,
    updated_at: String,
}

pub(super) struct PortfolioShell {
    snapshot: PortfolioSnapshot,
    pub(super) selected: usize,
    pub(super) detail: bool,
    native_fallback: bool,
}

impl PortfolioShell {
    pub(super) fn new(snapshot_json: &str, native_fallback: bool) -> Self {
        let snapshot = serde_json::from_str(snapshot_json).unwrap_or_else(|_| PortfolioSnapshot {
            error: Some("live portfolio data unavailable".to_owned()),
            ..PortfolioSnapshot::default()
        });
        Self {
            snapshot,
            selected: 0,
            detail: false,
            native_fallback,
        }
    }

    pub(super) fn input(&mut self, ev: &KeyEvent) -> String {
        let count = self.snapshot.repos.len();
        match ev.key {
            PhysicalKey::ArrowDown | PhysicalKey::J if count > 0 => {
                self.selected = (self.selected + 1) % count;
            }
            PhysicalKey::ArrowUp | PhysicalKey::K if count > 0 => {
                self.selected = (self.selected + count - 1) % count;
            }
            PhysicalKey::Home if count > 0 => self.selected = 0,
            PhysicalKey::End if count > 0 => self.selected = count - 1,
            PhysicalKey::Enter | PhysicalKey::NumpadEnter | PhysicalKey::ArrowRight
                if count > 0 =>
            {
                self.detail = true
            }
            PhysicalKey::Escape | PhysicalKey::Backspace | PhysicalKey::ArrowLeft
                if self.detail =>
            {
                self.detail = false
            }
            _ => return String::new(),
        }
        self.render()
    }

    pub(super) fn repo_count(&self) -> usize {
        self.snapshot.repos.len()
    }

    pub(super) fn render(&self) -> String {
        let mut out = String::from("\x1b[2J\x1b[H");
        out.push_str(&format!(
            "  {VIOLET}{BOLD}phall.io{RESET}  {DIM}live systems console{RESET}\r\n"
        ));
        if self.native_fallback {
            out.push_str(&format!(
                "  {BOLD}Native shells are busy or unavailable.{RESET} This is the instant edge tour.\r\n"
            ));
        }
        out.push_str(&format!(
            "  {DIM}VISITOR · READ ONLY · powered by phux · refreshed {}{RESET}\r\n",
            short_date(&self.snapshot.fetched_at)
        ));
        out.push_str("\r\n");

        if let Some(error) = &self.snapshot.error {
            out.push_str(&format!("  {DIM}{error}{RESET}\r\n"));
            return out;
        }
        if self.snapshot.repos.is_empty() {
            out.push_str(&format!(
                "  {DIM}no public showcase repositories found{RESET}\r\n"
            ));
            return out;
        }

        if self.detail {
            out.push_str(&self.render_detail());
        } else {
            out.push_str(&self.render_list());
        }
        out
    }

    fn render_list(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!("  {DIM}PROJECT              STACK          LATEST AUTOMATION                 UPDATED{RESET}\r\n"));
        out.push_str(&format!("  {DIM}──────────────────────────────────────────────────────────────────────────────────────────{RESET}\r\n"));
        for (index, repo) in self.snapshot.repos.iter().enumerate() {
            let selected = index == self.selected;
            let marker = if selected { "▸" } else { " " };
            let run = repo
                .latest_run
                .as_ref()
                .map_or_else(|| "· no workflow run".to_owned(), run_label);
            let row = format!(
                "{marker} {:<20} {:<14} {:<33} {:<10}",
                truncate(&repo.name, 20),
                truncate(repo.language.as_deref().unwrap_or("—"), 14),
                truncate(&run, 33),
                short_date(&repo.pushed_at),
            );
            if selected {
                out.push_str(&format!("\x1b[7m  {row:<94}\x1b[27m\r\n"));
            } else {
                out.push_str(&format!("  {row}\r\n"));
            }
        }
        out.push_str("\r\n");
        out.push_str(&format!("  {DIM}↑↓ / j k navigate   enter inspect   home/end jump   sessions expire automatically{RESET}\r\n"));
        out
    }

    fn render_detail(&self) -> String {
        let repo = &self.snapshot.repos[self.selected];
        let mut out = String::new();
        out.push_str(&format!(
            "  {BOLD}{}{RESET}\r\n",
            osc8(&repo.url, &repo.name)
        ));
        out.push_str(&format!(
            "  {}\r\n\r\n",
            repo.description.as_deref().unwrap_or("No description.")
        ));
        out.push_str(&format!(
            "  language     {}\r\n",
            repo.language.as_deref().unwrap_or("—")
        ));
        out.push_str(&format!("  stars        {}\r\n", repo.stars));
        out.push_str(&format!("  forks        {}\r\n", repo.forks));
        out.push_str(&format!("  open issues  {}\r\n", repo.open_issues));
        out.push_str(&format!(
            "  pushed       {}\r\n",
            short_date(&repo.pushed_at)
        ));
        if let Some(homepage) = &repo.homepage {
            out.push_str(&format!("  homepage     {}\r\n", osc8(homepage, homepage)));
        }
        if let Some(run) = &repo.latest_run {
            out.push_str("\r\n");
            out.push_str(&format!("  {DIM}LATEST AUTOMATION{RESET}\r\n"));
            out.push_str(&format!(
                "  {}  {}  {}  {}\r\n",
                run_glyph(run),
                run.workflow,
                run.branch,
                run_state(run)
            ));
            if !run.url.is_empty() {
                out.push_str(&format!("  {}\r\n", osc8(&run.url, "open workflow run ↗")));
            }
            out.push_str(&format!("  updated {}\r\n", short_date(&run.updated_at)));
        }
        out.push_str("\r\n");
        out.push_str(&format!("  {DIM}esc / ← back   links are clickable   GitHub access is structurally read-only{RESET}\r\n"));
        out
    }
}

fn run_glyph(run: &PortfolioRun) -> &'static str {
    if run.status != "completed" {
        "●"
    } else if run.conclusion.as_deref() == Some("success") {
        "✓"
    } else {
        "✗"
    }
}

fn run_state(run: &PortfolioRun) -> String {
    if run.status == "completed" {
        run.conclusion
            .clone()
            .unwrap_or_else(|| "completed".to_owned())
    } else {
        run.status.replace('_', " ")
    }
}

fn run_label(run: &PortfolioRun) -> String {
    format!("{} {} · {}", run_glyph(run), run.workflow, run_state(run))
}

fn truncate(value: &str, width: usize) -> String {
    if value.chars().count() <= width {
        return value.to_owned();
    }
    value
        .chars()
        .take(width.saturating_sub(1))
        .collect::<String>()
        + "…"
}

fn short_date(value: &str) -> &str {
    value.get(..10).unwrap_or(value)
}

fn osc8(url: &str, text: &str) -> String {
    format!("\x1b]8;;{url}\x1b\\\x1b[4m{text}\x1b[24m\x1b]8;;\x1b\\")
}
