use super::commands::{CleanupResult, RemovedNode};
use crate::code_server::CodeServerManager;
use crate::pty::PtyManager;

/// Centralized process lifecycle coordinator.
/// Wraps PtyManager and CodeServerManager to guarantee cleanup
/// when nodes are deleted from the canvas.
pub struct ProcessSupervisor;

impl ProcessSupervisor {
    pub fn new() -> Self {
        Self
    }

    /// Clean up processes for removed nodes. Idempotent:
    /// killing an already-dead PTY or stopping a stopped server is a no-op.
    pub fn cleanup_removed_nodes(
        &self,
        removed: &[RemovedNode],
        pty_mgr: &PtyManager,
        cs_mgr: &CodeServerManager,
    ) -> CleanupResult {
        let mut killed_ptys = 0u32;
        let mut stopped_servers = 0u32;

        for node in removed {
            match node.node_type.as_str() {
                "terminal" => {
                    if let Some(ref pty_id) = node.process_id {
                        if pty_mgr.kill(pty_id).is_ok() {
                            killed_ptys += 1;
                        }
                    }
                }
                "vscode" => {
                    if cs_mgr.stop(&node.node_id).is_ok() {
                        stopped_servers += 1;
                    }
                }
                _ => {} // note, obsidian, group: no process to clean
            }
        }

        CleanupResult {
            killed_ptys,
            stopped_servers,
        }
    }
}
