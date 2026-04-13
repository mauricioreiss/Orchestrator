pub mod commands;

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

// -- Graph data structures (mirrored from TypeScript) --

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum NodeData {
    #[serde(rename = "terminal")]
    Terminal {
        label: String,
        role: String,
        cwd: Option<String>,
        #[serde(rename = "ptyId")]
        pty_id: Option<String>,
    },
    #[serde(rename = "note")]
    Note {
        label: String,
        content: String,
        priority: u32,
    },
    #[serde(rename = "vscode")]
    VSCode {
        label: String,
        #[serde(rename = "workspacePath")]
        workspace_path: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CanvasNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub data: NodeData,
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

// -- Actions produced by diffing old vs new graph --

#[derive(Debug, Clone)]
pub enum ContextAction {
    DispatchNote {
        pty_id: String,
        note_id: String,
        terminal_id: String,
        content: String,
        priority: u32,
    },
    Interrupt {
        pty_id: String,
    },
    ClearInstruction {
        pty_id: String,
    },
    SetCwd {
        terminal_node_id: String,
        pty_id: Option<String>,
        cwd: String,
    },
}

// -- Context Manager --

pub struct ContextManager {
    graph: Mutex<Option<CanvasGraph>>,
    /// Tracks dispatched notes. Key: "noteId:terminalId", Value: content hash.
    dispatched: Mutex<HashMap<String, u64>>,
}

impl ContextManager {
    pub fn new() -> Self {
        Self {
            graph: Mutex::new(None),
            dispatched: Mutex::new(HashMap::new()),
        }
    }

    /// Receive a full graph snapshot. Diff against the previous state
    /// and return a list of actions to execute.
    pub fn sync(&self, new_graph: CanvasGraph) -> Vec<ContextAction> {
        let mut actions = Vec::new();
        let mut graph_guard = self.graph.lock().unwrap();
        let old_graph = graph_guard.take();
        let mut dispatched = self.dispatched.lock().unwrap();

        // 1. Note → Terminal connections: dispatch or re-dispatch
        let note_edges: Vec<&CanvasEdge> = new_graph
            .edges
            .iter()
            .filter(|e| e.source_type == "note" && e.target_type == "terminal")
            .collect();

        for edge in &note_edges {
            let note = new_graph.nodes.iter().find(|n| n.id == edge.source);
            let terminal = new_graph.nodes.iter().find(|n| n.id == edge.target);

            if let (Some(note), Some(terminal)) = (note, terminal) {
                if let NodeData::Note {
                    content, priority, ..
                } = &note.data
                {
                    if let NodeData::Terminal {
                        pty_id: Some(pty_id),
                        ..
                    } = &terminal.data
                    {
                        let key = format!("{}:{}", note.id, terminal.id);
                        let content_hash = hash_str(content);

                        let needs_dispatch = dispatched
                            .get(&key)
                            .map(|h| *h != content_hash)
                            .unwrap_or(true);

                        if needs_dispatch {
                            actions.push(ContextAction::DispatchNote {
                                pty_id: pty_id.clone(),
                                note_id: note.id.clone(),
                                terminal_id: terminal.id.clone(),
                                content: content.clone(),
                                priority: *priority,
                            });
                            dispatched.insert(key, content_hash);
                        }
                    }
                }
            }
        }

        // Sort dispatch actions: higher priority number first, so the
        // lowest priority number (= most important) is injected LAST
        // and becomes the most recent content in the terminal.
        actions.sort_by(|a, b| {
            match (a, b) {
                (
                    ContextAction::DispatchNote { priority: pa, .. },
                    ContextAction::DispatchNote { priority: pb, .. },
                ) => pb.cmp(pa),
                _ => std::cmp::Ordering::Equal,
            }
        });

        // 2. Detect disconnected note→terminal edges
        if let Some(ref old) = old_graph {
            for old_edge in &old.edges {
                if old_edge.source_type != "note" || old_edge.target_type != "terminal" {
                    continue;
                }

                let still_exists = new_graph
                    .edges
                    .iter()
                    .any(|e| e.source == old_edge.source && e.target == old_edge.target);

                if !still_exists {
                    if let Some(terminal) = old.nodes.iter().find(|n| n.id == old_edge.target) {
                        if let NodeData::Terminal {
                            pty_id: Some(pty_id),
                            ..
                        } = &terminal.data
                        {
                            actions.push(ContextAction::Interrupt {
                                pty_id: pty_id.clone(),
                            });
                            actions.push(ContextAction::ClearInstruction {
                                pty_id: pty_id.clone(),
                            });
                        }
                    }

                    let key = format!("{}:{}", old_edge.source, old_edge.target);
                    dispatched.remove(&key);
                }
            }
        }

        // 3. VSCode → Terminal connections: cwd propagation
        for edge in new_graph
            .edges
            .iter()
            .filter(|e| e.source_type == "vscode" && e.target_type == "terminal")
        {
            if let Some(vscode) = new_graph.nodes.iter().find(|n| n.id == edge.source) {
                if let NodeData::VSCode { workspace_path, .. } = &vscode.data {
                    let terminal = new_graph.nodes.iter().find(|n| n.id == edge.target);
                    let pty_id = terminal.and_then(|t| {
                        if let NodeData::Terminal { pty_id, .. } = &t.data {
                            pty_id.clone()
                        } else {
                            None
                        }
                    });

                    actions.push(ContextAction::SetCwd {
                        terminal_node_id: edge.target.clone(),
                        pty_id,
                        cwd: workspace_path.clone(),
                    });
                }
            }
        }

        *graph_guard = Some(new_graph);
        actions
    }
}

fn hash_str(s: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}
