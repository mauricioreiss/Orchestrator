use serde::{Deserialize, Serialize};
use tauri::State;

use super::ProcessSupervisor;
use crate::code_server::CodeServerManager;
use crate::pty::PtyManager;

#[derive(Debug, Deserialize)]
pub struct RemovedNode {
    pub node_id: String,
    pub node_type: String,
    pub process_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CleanupResult {
    pub killed_ptys: u32,
    pub stopped_servers: u32,
}

#[tauri::command]
pub fn cleanup_nodes(
    supervisor: State<'_, ProcessSupervisor>,
    pty: State<'_, PtyManager>,
    cs: State<'_, CodeServerManager>,
    removed: Vec<RemovedNode>,
) -> Result<CleanupResult, String> {
    Ok(supervisor.cleanup_removed_nodes(&removed, &pty, &cs))
}
