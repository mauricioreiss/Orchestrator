use serde::Serialize;
use tauri::State;

use super::{CanvasGraph, ContextAction, ContextManager};
use crate::pty::PtyManager;

#[derive(Serialize)]
pub struct SyncResult {
    pub dispatched: u32,
    pub interrupted: u32,
    pub cwd_updates: Vec<CwdUpdate>,
}

#[derive(Serialize)]
pub struct CwdUpdate {
    #[serde(rename = "terminalNodeId")]
    pub terminal_node_id: String,
    pub cwd: String,
}

/// Frontend pushes full graph state on every meaningful change.
/// Backend diffs, dispatches notes, sends interrupts, returns results.
#[tauri::command]
pub fn sync_canvas(
    ctx: State<'_, ContextManager>,
    pty: State<'_, PtyManager>,
    graph: CanvasGraph,
) -> Result<SyncResult, String> {
    let actions = ctx.sync(graph);
    let mut result = SyncResult {
        dispatched: 0,
        interrupted: 0,
        cwd_updates: Vec::new(),
    };

    for action in actions {
        match action {
            ContextAction::DispatchNote {
                pty_id,
                content,
                priority,
                ..
            } => {
                let formatted = format_note_injection(&content, priority);
                pty.write(&pty_id, formatted.as_bytes())?;
                result.dispatched += 1;
            }
            ContextAction::Interrupt { pty_id } => {
                pty.write(&pty_id, &[0x03])?;
                result.interrupted += 1;
            }
            ContextAction::ClearInstruction { pty_id } => {
                let msg = format_note_cleared();
                pty.write(&pty_id, msg.as_bytes())?;
            }
            ContextAction::SetCwd {
                terminal_node_id,
                pty_id,
                cwd,
            } => {
                // If PTY is already running, send cd command
                if let Some(ref pid) = pty_id {
                    let cd_cmd = format!("cd \"{cwd}\"\r\n");
                    // Best-effort: PTY may not exist yet
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

/// Format note content for injection into PTY stdin.
/// Uses clear-screen + ANSI formatting to make the instruction
/// the most visible and recent content in the terminal.
fn format_note_injection(content: &str, priority: u32) -> String {
    let separator = "=".repeat(55);
    format!(
        "\x03\n\
         \x1b[2J\x1b[H\
         \x1b[1;33m{separator}\x1b[0m\n\
         \x1b[1;33m MAESTRI-X SYSTEM INSTRUCTION (Priority: {priority})\x1b[0m\n\
         \x1b[1;33m{separator}\x1b[0m\n\
         \n\
         {content}\n\
         \n\
         \x1b[1;33m{separator}\x1b[0m\n\
         \x1b[1;33m END SYSTEM INSTRUCTION\x1b[0m\n\
         \x1b[1;33m THIS INSTRUCTION SUPERSEDES ALL PREVIOUS CONTEXT.\x1b[0m\n\
         \x1b[1;33m{separator}\x1b[0m\n\n"
    )
}

/// Message shown when a note is disconnected from a terminal.
fn format_note_cleared() -> String {
    "\n\x1b[1;31m--- MAESTRI-X: Context note disconnected. Previous instruction no longer active. ---\x1b[0m\n\n"
        .to_string()
}
