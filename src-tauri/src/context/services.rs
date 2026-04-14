use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use super::models::{CanvasEdge, CanvasGraph, ContextAction, NodeData, TerminalRole};

/// The Maestro Bus: central event dispatcher for the canvas graph.
///
/// Receives full graph snapshots from the frontend, diffs against
/// the previous state, and produces a list of actions to execute.
/// Acts as the single source of truth for context propagation:
/// - Note → Terminal: content injection with priority ordering
/// - VSCode → Terminal: workspace directory propagation
/// - Edge removal detection: interrupt + clear
pub struct ContextManager {
    graph: Mutex<Option<CanvasGraph>>,
    /// Tracks dispatched notes. Key: "noteId:terminalId", Value: content hash.
    dispatched: Mutex<HashMap<String, u64>>,
    /// Tracks last cwd sent to each terminal. Key: terminal_node_id, Value: cwd path.
    cwd_sent: Mutex<HashMap<String, String>>,
}

impl ContextManager {
    pub fn new() -> Self {
        Self {
            graph: Mutex::new(None),
            dispatched: Mutex::new(HashMap::new()),
            cwd_sent: Mutex::new(HashMap::new()),
        }
    }

    /// Receive a full graph snapshot. Diff against the previous state
    /// and return a list of actions to execute.
    pub fn sync(&self, new_graph: CanvasGraph) -> Vec<ContextAction> {
        let mut actions = Vec::new();
        let mut graph_guard = self.graph.lock().unwrap();
        let old_graph = graph_guard.take();
        let mut dispatched = self.dispatched.lock().unwrap();

        // 1. Note → Terminal: dispatch or re-dispatch on content change
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
                                is_leader_context: false,
                            });
                            dispatched.insert(key, content_hash);
                        }
                    }
                }
            }
        }

        // 1b. Obsidian → Terminal: dispatch vault content (same pattern as notes, priority=1)
        let obsidian_edges: Vec<&CanvasEdge> = new_graph
            .edges
            .iter()
            .filter(|e| e.source_type == "obsidian" && e.target_type == "terminal")
            .collect();

        for edge in &obsidian_edges {
            let obs = new_graph.nodes.iter().find(|n| n.id == edge.source);
            let terminal = new_graph.nodes.iter().find(|n| n.id == edge.target);

            if let (Some(obs), Some(terminal)) = (obs, terminal) {
                if let NodeData::Obsidian {
                    content: Some(content),
                    ..
                } = &obs.data
                {
                    if let NodeData::Terminal {
                        pty_id: Some(pty_id),
                        ..
                    } = &terminal.data
                    {
                        let key = format!("{}:{}", obs.id, terminal.id);
                        let content_hash = hash_str(content);

                        let needs_dispatch = dispatched
                            .get(&key)
                            .map(|h| *h != content_hash)
                            .unwrap_or(true);

                        if needs_dispatch {
                            actions.push(ContextAction::DispatchNote {
                                pty_id: pty_id.clone(),
                                note_id: obs.id.clone(),
                                terminal_id: terminal.id.clone(),
                                content: content.clone(),
                                priority: 1,
                                is_leader_context: false,
                            });
                            dispatched.insert(key, content_hash);
                        }
                    }
                }
            }
        }

        // 1c. Leader context aggregation: when Note→Leader, also gather Obsidian→Leader content.
        // The aggregated Obsidian knowledge is injected at priority 0 (before the note instruction).
        for edge in &note_edges {
            let terminal = new_graph.nodes.iter().find(|n| n.id == edge.target);
            if let Some(terminal) = terminal {
                if let NodeData::Terminal {
                    role: TerminalRole::Leader,
                    pty_id: Some(pty_id),
                    ..
                } = &terminal.data
                {
                    let obsidian_parts: Vec<String> = new_graph
                        .edges
                        .iter()
                        .filter(|e| e.target == terminal.id && e.source_type == "obsidian")
                        .filter_map(|e| new_graph.nodes.iter().find(|n| n.id == e.source))
                        .filter_map(|n| {
                            if let NodeData::Obsidian {
                                content: Some(c),
                                label,
                                ..
                            } = &n.data
                            {
                                Some(format!("--- {} ---\n{}", label, c))
                            } else {
                                None
                            }
                        })
                        .collect();

                    if !obsidian_parts.is_empty() {
                        let aggregated = obsidian_parts.join("\n\n");
                        let key = format!("leader-ctx:{}", terminal.id);
                        let content_hash = hash_str(&aggregated);
                        let changed = dispatched
                            .get(&key)
                            .map(|h| *h != content_hash)
                            .unwrap_or(true);

                        if changed {
                            actions.push(ContextAction::DispatchNote {
                                pty_id: pty_id.clone(),
                                note_id: format!("__leader_ctx_{}", terminal.id),
                                terminal_id: terminal.id.clone(),
                                content: aggregated,
                                priority: 0,
                                is_leader_context: true,
                            });
                            dispatched.insert(key, content_hash);
                        }
                    }
                }
            }
        }

        // Priority sort: higher number first so P1 (most important) is injected LAST
        actions.sort_by(|a, b| match (a, b) {
            (
                ContextAction::DispatchNote { priority: pa, .. },
                ContextAction::DispatchNote { priority: pb, .. },
            ) => pb.cmp(pa),
            _ => std::cmp::Ordering::Equal,
        });

        // 2. Detect disconnected note→terminal and obsidian→terminal edges
        if let Some(ref old) = old_graph {
            for old_edge in &old.edges {
                let is_content_edge =
                    (old_edge.source_type == "note" || old_edge.source_type == "obsidian")
                        && old_edge.target_type == "terminal";
                if !is_content_edge {
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

        // 3. VSCode → Terminal: cwd propagation (only on actual change)
        let mut cwd_sent = self.cwd_sent.lock().unwrap();
        for edge in new_graph
            .edges
            .iter()
            .filter(|e| e.source_type == "vscode" && e.target_type == "terminal")
        {
            if let Some(vscode) = new_graph.nodes.iter().find(|n| n.id == edge.source) {
                if let NodeData::VSCode { workspace_path, .. } = &vscode.data {
                    if workspace_path.is_empty() {
                        continue;
                    }

                    let already_sent = cwd_sent
                        .get(&edge.target)
                        .map(|prev| prev == workspace_path)
                        .unwrap_or(false);

                    if !already_sent {
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
                        cwd_sent.insert(edge.target.clone(), workspace_path.clone());
                    }
                }
            }
        }

        // Clean up cwd_sent for terminals no longer connected to vscode
        let vscode_targets: Vec<String> = new_graph
            .edges
            .iter()
            .filter(|e| e.source_type == "vscode" && e.target_type == "terminal")
            .map(|e| e.target.clone())
            .collect();
        cwd_sent.retain(|k, _| vscode_targets.contains(k));

        // 4. Terminal → Terminal: auto-pipe output on every sync
        for edge in new_graph
            .edges
            .iter()
            .filter(|e| e.source_type == "terminal" && e.target_type == "terminal")
        {
            let source = new_graph.nodes.iter().find(|n| n.id == edge.source);
            let target = new_graph.nodes.iter().find(|n| n.id == edge.target);

            if let (Some(source), Some(target)) = (source, target) {
                if let (
                    NodeData::Terminal {
                        pty_id: Some(src_pty),
                        ..
                    },
                    NodeData::Terminal {
                        pty_id: Some(tgt_pty),
                        ..
                    },
                ) = (&source.data, &target.data)
                {
                    actions.push(ContextAction::PipeOutput {
                        source_pty_id: src_pty.clone(),
                        target_pty_id: tgt_pty.clone(),
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
