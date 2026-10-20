use super::Shell;
use super::portfolio::PortfolioShell;

#[test]
fn welcome_is_concise_and_keeps_real_ansi_output() {
    let greeting = String::from_utf8(Shell::new("demo", "").greeting()).unwrap();
    assert!(greeting.starts_with("\x1b[2J\x1b[H"));
    assert!(greeting.contains("Welcome to phux."));
    assert!(greeting.contains("to explore, then split a pane."));
    assert!(!greeting.contains("served from the edge"));
    assert!(!greeting.contains("try:"));
    assert!(greeting.ends_with(" $ "));
}

#[test]
fn invalid_portfolio_data_fails_closed() {
    let shell = PortfolioShell::new("not json", false);
    assert!(shell.render().contains("live portfolio data unavailable"));
}

#[test]
fn portfolio_renders_only_supplied_repositories() {
    let shell = PortfolioShell::new(
        r#"{"schema":1,"owner":"phall1","fetched_at":"2026-07-11T00:00:00Z","repos":[{"name":"phui","description":"GitHub TUI","url":"https://github.com/phall1/phui","homepage":"https://phall.io","language":"TypeScript","stars":1,"forks":2,"open_issues":3,"pushed_at":"2026-07-11T00:00:00Z","latest_run":null}]}"#,
        false,
    );
    let rendered = shell.render();
    assert!(rendered.contains("phui"));
    assert!(!rendered.contains("private-repo"));
}

#[test]
fn native_fallback_is_honest() {
    let shell = PortfolioShell::new(
        r#"{"schema":1,"owner":"phall1","fetched_at":"2026-07-11T00:00:00Z","repos":[]}"#,
        true,
    );
    let rendered = shell.render();
    assert!(rendered.contains("Native shells are busy or unavailable"));
    assert!(rendered.contains("instant edge tour"));
}

#[test]
fn glass_workspace_is_opt_in_compact_real_output_without_color_bars() {
    let mut shell = Shell::new("demo", "");
    let output = String::from_utf8(shell.paste("demo glass\n").unwrap()).unwrap();
    let screen = output.split("\x1b[2J\x1b[H").last().unwrap();
    assert!(screen.contains("phux / workspace"));
    assert!(screen.contains("one session"));
    assert!(screen.contains("independent panes"));
    assert!(screen.ends_with("›\x1b[0m "));
    assert_eq!(screen.matches("\r\n").count(), 4);
    // Strip SGR fields before measuring these deliberately narrow lines.
    let mut visible = String::new();
    let mut escape = false;
    for ch in screen.chars() {
        if ch == '\x1b' {
            escape = true;
            continue;
        }
        if escape {
            if ch == 'm' {
                escape = false;
            }
            continue;
        }
        visible.push(ch);
    }
    assert!(visible.lines().all(|line| line.chars().count() <= 24));
    for unwanted in [" $ ", "truecolor", "48;", "Linux", "CPU", "connected", "──"] {
        assert!(
            !screen.contains(unwanted),
            "unexpected claim or decoration: {unwanted}"
        );
    }
    assert!(
        Shell::new("demo", "").prompt().ends_with(" $ "),
        "other embeds keep their prompt"
    );
}

#[test]
fn glass_theme_changes_prompt_only_and_preserves_real_commands() {
    let mut shell = Shell::new("demo", "");
    let output = String::from_utf8(shell.paste("theme glass\necho hello\nls\n").unwrap()).unwrap();
    assert!(output.contains("\x1b[2J\x1b[H"));
    assert!(output.contains("hello\r\n"));
    assert!(output.contains("README"));
    assert!(
        !output.contains("phux / workspace"),
        "prompt-only theme stays quiet"
    );
    let restored = String::from_utf8(shell.paste("theme default\n").unwrap()).unwrap();
    assert!(restored.ends_with(" $ "));
}

#[test]
fn glass_theme_survives_checkpoint_and_legacy_state_keeps_default() {
    let mut shell = Shell::new("demo", "");
    shell.paste("theme glass\necho pending").unwrap();
    let saved = serde_json::to_string(&shell.checkpoint()).unwrap();
    let mut restored = Shell::new("demo", "");
    restored
        .restore(serde_json::from_str(&saved).unwrap())
        .unwrap();
    assert!(restored.glass);
    assert_eq!(restored.line, "echo pending");
    assert!(
        String::from_utf8(restored.greeting())
            .unwrap()
            .ends_with("›\x1b[0m echo pending")
    );
    let legacy = serde_json::from_str(r#"{"kind":"demo","line":"echo old"}"#).unwrap();
    restored.restore(legacy).unwrap();
    assert!(!restored.glass);
    assert_eq!(
        serde_json::to_string(&Shell::new("demo", "").checkpoint()).unwrap(),
        r#"{"kind":"demo","line":""}"#
    );
}

#[test]
fn theme_refusals_do_not_mutate_presentation_or_portfolio_modes() {
    let mut shell = Shell::new("demo", "");
    let output = String::from_utf8(shell.paste("theme neon\n").unwrap()).unwrap();
    assert!(output.contains("theme: choose glass or default"));
    assert!(!shell.glass);
    shell.paste("theme glass\ntheme default extra\n").unwrap();
    assert!(shell.glass);
    assert!(
        Shell::new("portfolio", "{}")
            .paste("theme glass\n")
            .is_err()
    );
}

const PAIR_CONTEXT: &str = r#"{"pair":{"link":"https://phux.sh/phone#one-shot"}}"#;

#[test]
fn a_paired_demo_opens_with_the_command_ready_and_runs_it_on_enter() {
    let mut shell = Shell::new("demo", PAIR_CONTEXT);
    assert_eq!(shell.line, "phux pair");
    let greeting = String::from_utf8(shell.greeting()).unwrap();
    assert!(greeting.contains("open this shell on your phone"));
    assert!(greeting.ends_with("phux pair"));
    let output = String::from_utf8(shell.paste("phux pair\n").unwrap()).unwrap();
    assert!(output.contains("Pair your phone"));
    assert!(output.contains("https://phux.sh/phone#one-shot"));
    assert!(
        output.contains("\x1b[47m\x1b[30m"),
        "the code asks for paper, not an inverted dark code"
    );
}

#[test]
fn the_pair_suggestion_is_replaced_by_typing_not_appended_to() {
    let mut shell = Shell::new("demo", PAIR_CONTEXT);
    let output = String::from_utf8(shell.paste("help\n").unwrap()).unwrap();
    assert!(!output.contains("phux pairhelp"));
    assert!(output.contains("phux demo shell"));
    assert!(
        !String::from_utf8(shell.greeting())
            .unwrap()
            .contains("phux pair")
    );
}

#[test]
fn pair_flags_refuse_ambiguity_and_qr_alone_hides_the_link_text() {
    let mut shell = Shell::new("demo", PAIR_CONTEXT);
    let both = String::from_utf8(shell.paste("phux pair --qr --no-qr\n").unwrap()).unwrap();
    assert!(both.contains("cannot combine"));
    let qr = String::from_utf8(shell.paste("phux pair --qr\n").unwrap()).unwrap();
    assert!(qr.contains("\x1b[47m\x1b[30m"));
    assert!(!qr.contains("Pair your phone"));
    assert!(!qr.contains("https://phux.sh/phone#one-shot"));
    let link = String::from_utf8(shell.paste("phux pair --no-qr\n").unwrap()).unwrap();
    assert!(link.contains("https://phux.sh/phone#one-shot"));
    assert!(!link.contains("\x1b[47m\x1b[30m"));
}

#[test]
fn a_shell_without_a_worker_link_says_so_instead_of_faking_a_code() {
    let mut shell = Shell::new("demo", "");
    assert!(shell.line.is_empty());
    let output = String::from_utf8(shell.paste("phux pair\n").unwrap()).unwrap();
    assert!(output.contains("has no pairing link"));
    assert!(!output.contains("\x1b[47m\x1b[30m"));
}

#[test]
fn explicit_color_demo_is_still_available_after_glass_opt_in() {
    let mut shell = Shell::new("demo", "");
    let output = String::from_utf8(shell.paste("demo workspace\ndemo colors\n").unwrap()).unwrap();
    assert!(shell.glass);
    assert!(output.contains("truecolor:"));
    assert!(output.contains("\x1b[48;2;"));
}
