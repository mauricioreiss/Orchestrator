use serde::{Deserialize, Serialize};

// -- Terminal roles --

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub enum TerminalRole {
    #[serde(rename = "Leader")]
    Leader,
    #[serde(rename = "Coder")]
    Coder,
    #[serde(rename = "Agent")]
    Agent,
    #[serde(rename = "CyberSec")]
    CyberSec,
}

impl Default for TerminalRole {
    fn default() -> Self {
        Self::Agent
    }
}

// -- Graph data structures (mirrored from TypeScript) --

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum NodeData {
    #[serde(rename = "terminal")]
    Terminal {
        label: String,
        role: TerminalRole,
        cwd: Option<String>,
        #[serde(rename = "ptyId")]
        pty_id: Option<String>,
    },
    #[serde(rename = "note")]
    Note {
        label: String,
        content: String,
        priority: u32,
        #[serde(rename = "commandMode", default)]
        command_mode: bool,
    },
    #[serde(rename = "vscode")]
    VSCode {
        label: String,
        #[serde(rename = "workspacePath")]
        workspace_path: String,
    },
    #[serde(rename = "obsidian")]
    Obsidian {
        label: String,
        #[serde(rename = "vaultPath")]
        vault_path: String,
        content: Option<String>,
    },
    #[serde(rename = "group")]
    Group {
        label: String,
        color: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CanvasNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub data: NodeData,
    #[serde(rename = "parentId", default)]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CanvasEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "sourceType")]
    pub source_type: String,
    #[serde(rename = "targetType")]
    pub target_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CanvasGraph {
    pub nodes: Vec<CanvasNode>,
    pub edges: Vec<CanvasEdge>,
    pub version: u64,
}

// -- Actions produced by the Maestro Bus (event dispatcher) --

#[derive(Debug, Clone)]
pub enum ContextAction {
    /// Inject note content into a terminal via PTY
    DispatchNote {
        pty_id: String,
        note_id: String,
        terminal_id: String,
        content: String,
        priority: u32,
        /// True when this dispatch is aggregated Obsidian context for a Leader terminal.
        is_leader_context: bool,
    },
    /// Send Ctrl+C to interrupt current command
    Interrupt {
        pty_id: String,
    },
    /// Notify terminal that a note was disconnected
    ClearInstruction {
        pty_id: String,
    },
    /// Propagate workspace directory to a terminal
    SetCwd {
        terminal_node_id: String,
        pty_id: Option<String>,
        cwd: String,
    },
    /// Auto-pipe output from source terminal to target terminal
    PipeOutput {
        source_pty_id: String,
        target_pty_id: String,
    },
}

// -- Sync response types --

#[derive(Serialize)]
pub struct SyncResult {
    pub dispatched: u32,
    pub interrupted: u32,
    pub piped: u32,
    pub leader_contexts: u32,
    pub cwd_updates: Vec<CwdUpdate>,
}

#[derive(Serialize)]
pub struct CwdUpdate {
    #[serde(rename = "terminalNodeId")]
    pub terminal_node_id: String,
    pub cwd: String,
}
