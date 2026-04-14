use serde::{Deserialize, Serialize};

/// A saved canvas state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCanvas {
    pub id: String,
    pub name: String,
    /// Full canvas state as JSON (nodes, edges, viewport)
    pub data: String,
    pub updated_at: String,
}

/// Summary for listing canvases (without the full data blob).
#[derive(Debug, Clone, Serialize)]
pub struct CanvasSummary {
    pub id: String,
    pub name: String,
    pub updated_at: String,
}

