use tauri::{Emitter, State};

use super::models::{CanvasGraph, ContextAction, CwdUpdate, SyncResult};
use super::services::ContextManager;
use crate::pty::PtyManager;

/// Frontend pushes full graph state on every meaningful change.
/// Backend diffs, dispatches notes, sends interrupts, returns results.
#[tauri::command]
pub fn sync_canvas(
    app: tauri::AppHandle,
    ctx: State<'_, ContextManager>,
    pty: State<'_, PtyManager>,
    graph: CanvasGraph,
) -> Result<SyncResult, String> {
    let actions = ctx.sync(graph);
    let mut result = SyncResult {
        dispatched: 0,
        interrupted: 0,
        piped: 0,
        leader_contexts: 0,
        cwd_updates: Vec::new(),
    };

    for action in actions {
        match action {
            ContextAction::DispatchNote {
                pty_id,
                note_id,
                terminal_id,
                content,
                priority,
                is_leader_context,
            } => {
                log::debug!("Injecting note {note_id} into terminal {terminal_id} (pty {pty_id})");
                let formatted = if is_leader_context {
                    format_leader_injection(&content, priority)
                } else {
                    format_note_injection(&content, priority)
                };
                // Send Ctrl+C to break any ongoing command
                pty.write(&pty_id, &[0x03])?;
                // Emit injection to frontend for direct xterm.js rendering
                // (writing ANSI to PTY stdin doesn't work: shell interprets it as input)
                let event = format!("context-injection-{pty_id}");
                let _ = app.emit(&event, &formatted);
                if is_leader_context {
                    result.leader_contexts += 1;
                } else {
                    result.dispatched += 1;
                }
            }
            ContextAction::Interrupt { pty_id } => {
                pty.write(&pty_id, &[0x03])?;
                result.interrupted += 1;
            }
            ContextAction::ClearInstruction { pty_id } => {
                let msg = format_note_cleared();
                let event = format!("context-injection-{pty_id}");
                let _ = app.emit(&event, &msg);
            }
            ContextAction::PipeOutput {
                source_pty_id,
                target_pty_id,
            } => {
                match pty.pipe_output(&source_pty_id, &target_pty_id) {
                    Ok(n) if n > 0 => result.piped += 1,
                    _ => {} // No output or error, skip silently
                }
            }
            ContextAction::SetCwd {
                terminal_node_id,
                pty_id,
                cwd,
            } => {
                // If PTY is already running, send cd command.
                // Sanitize path: strip quotes and dangerous chars to prevent injection.
                if let Some(ref pid) = pty_id {
                    let safe_cwd = cwd.replace('"', "").replace('`', "").replace(';', "");
                    let cd_cmd = format!("cd \"{safe_cwd}\"\r\n");
                    let _ = pty.write(pid, cd_cmd.as_bytes());
                }
                result.cwd_updates.push(CwdUpdate {
                    terminal_node_id,
                    cwd,
                });
            }
        }
    }

    Ok(result)
}

/// Send Ctrl+C interrupt to a specific PTY.
#[tauri::command]
pub fn send_interrupt(pty: State<'_, PtyManager>, pty_id: String) -> Result<(), String> {
    pty.write(&pty_id, &[0x03])
}

/// Sanitize note content before PTY injection.
///
/// Removes/escapes characters that could cause malicious command execution:
/// - Control characters (0x00-0x1F) except \n and \t
/// - ANSI escape sequences embedded in user content
/// - Shell metacharacters: ;  &&  ||  |  $()  `` (backticks)
///
/// The content is meant to be READ by agents, not executed as shell commands.
/// This is defense-in-depth against injection via crafted notes.
fn sanitize_note_content(content: &str) -> String {
    let mut result = String::with_capacity(content.len());

    let mut chars = content.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            // Strip ANSI escape sequences (\x1b[...m, \x1b[...H, etc.)
            '\x1b' => {
                // Consume the escape sequence
                if chars.peek() == Some(&'[') {
                    chars.next(); // consume '['
                    // Read until we hit a letter (end of ANSI sequence)
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                // Don't emit anything for the escape sequence
            }
            // Strip control chars except newline and tab
            c if c.is_control() && c != '\n' && c != '\t' => {}
            // Escape shell pipe operator
            '|' => result.push_str("[pipe]"),
            // Escape semicolon (command separator)
            ';' => result.push_str("[semicolon]"),
            // Escape backtick (command substitution)
            '`' => result.push_str("[backtick]"),
            // Check for && and $( patterns
            '&' => {
                if chars.peek() == Some(&'&') {
                    chars.next();
                    result.push_str("[and]");
                } else {
                    result.push('&');
                }
            }
            '$' => {
                if chars.peek() == Some(&'(') {
                    chars.next();
                    result.push_str("[subshell](");
                } else {
                    result.push('$');
                }
            }
            // Safe character, pass through
            _ => result.push(ch),
        }
    }

    result
}

/// Format note content for direct rendering in xterm.js.
/// Uses clear-screen + ANSI formatting for clean presentation.
/// Content is sanitized before injection.
fn format_note_injection(content: &str, priority: u32) -> String {
    let safe_content = sanitize_note_content(content);
    let separator = "=".repeat(55);
    format!(
        "\x1b[2J\x1b[H\
         \x1b[1;33m{separator}\x1b[0m\r\n\
         \x1b[1;33m  MAESTRI-X SYSTEM INSTRUCTION (Priority: {priority})\x1b[0m\r\n\
         \x1b[1;33m{separator}\x1b[0m\r\n\
         \r\n\
         {safe_content}\r\n\
         \r\n\
         \x1b[1;33m{separator}\x1b[0m\r\n\
         \x1b[1;33m  END SYSTEM INSTRUCTION\x1b[0m\r\n\
         \x1b[1;33m{separator}\x1b[0m\r\n\r\n"
    )
}

/// Format aggregated Obsidian context for direct rendering in xterm.js.
/// Uses green ANSI (emerald) to visually distinguish from regular note injections (yellow).
fn format_leader_injection(content: &str, priority: u32) -> String {
    let safe_content = sanitize_note_content(content);
    let separator = "=".repeat(55);
    format!(
        "\x1b[2J\x1b[H\
         \x1b[1;32m{separator}\x1b[0m\r\n\
         \x1b[1;32m  MAESTRI-X LEADER BRIEFING (Priority: {priority})\x1b[0m\r\n\
         \x1b[1;32m{separator}\x1b[0m\r\n\
         \r\n\
         \x1b[1;35m[KNOWLEDGE BASE]\x1b[0m\r\n\
         {safe_content}\r\n\
         \r\n\
         \x1b[1;32m{separator}\x1b[0m\r\n\
         \x1b[1;32m  END LEADER BRIEFING\x1b[0m\r\n\
         \x1b[1;32m{separator}\x1b[0m\r\n\r\n"
    )
}

/// Message shown when a note is disconnected from a terminal.
fn format_note_cleared() -> String {
    "\r\n\x1b[1;31m--- MAESTRI-X: Context note disconnected. Previous instruction no longer active. ---\x1b[0m\r\n\r\n"
        .to_string()
}
