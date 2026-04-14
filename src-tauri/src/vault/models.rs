use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct VaultFile {
    pub name: String,
    /// Path relative to vault root (forward slashes)
    pub relative_path: String,
    pub size: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultContent {
    pub relative_path: String,
    pub content: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultSearchMatch {
    pub line_number: usize,
    pub line_content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultSearchResult {
    pub name: String,
    pub relative_path: String,
    pub size: u64,
    pub matches: Vec<VaultSearchMatch>,
}
