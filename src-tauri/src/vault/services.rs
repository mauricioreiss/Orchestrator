use std::path::PathBuf;

use super::models::{VaultContent, VaultFile, VaultSearchMatch, VaultSearchResult};

const MAX_FILE_SIZE: u64 = 65536; // 64KB

/// Stateless vault reader. All methods are static since there's no mutable state.
/// Security: every path operation validates against directory traversal.
pub struct VaultManager;

impl VaultManager {
    /// Resolve and validate a path is within the vault root.
    fn safe_resolve(root: &PathBuf, sub: &str) -> Result<PathBuf, String> {
        let resolved = root
            .join(sub)
            .canonicalize()
            .map_err(|e| format!("invalid path: {e}"))?;

        if !resolved.starts_with(root) {
            return Err("path traversal denied".into());
        }
        Ok(resolved)
    }

    /// List .md files and subdirectories in a vault folder.
    pub fn list_files(vault_root: &str, subfolder: Option<&str>) -> Result<Vec<VaultFile>, String> {
        let root = PathBuf::from(vault_root)
            .canonicalize()
            .map_err(|e| format!("invalid vault path: {e}"))?;

        let target = match subfolder {
            Some(sub) => Self::safe_resolve(&root, sub)?,
            None => root.clone(),
        };

        let entries = std::fs::read_dir(&target)
            .map_err(|e| format!("read_dir failed: {e}"))?;

        let mut files = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            let is_dir = path.is_dir();

            // Include directories and .md files
            let include = is_dir
                || path
                    .extension()
                    .map(|ext| ext == "md")
                    .unwrap_or(false);

            if !include {
                continue;
            }

            let meta = entry.metadata().map_err(|e| format!("metadata: {e}"))?;
            let relative = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            files.push(VaultFile {
                name: entry.file_name().to_string_lossy().into(),
                relative_path: relative,
                size: if is_dir { 0 } else { meta.len() },
                is_dir,
            });
        }

        // Directories first, then files, both sorted alphabetically
        files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(files)
    }

    /// Read a single .md file content. Max 64KB.
    pub fn read_file(vault_root: &str, relative_path: &str) -> Result<VaultContent, String> {
        let root = PathBuf::from(vault_root)
            .canonicalize()
            .map_err(|e| format!("invalid vault path: {e}"))?;

        let file_path = Self::safe_resolve(&root, relative_path)?;

        if !file_path.is_file() {
            return Err("not a file".into());
        }

        let meta = std::fs::metadata(&file_path)
            .map_err(|e| format!("metadata failed: {e}"))?;

        if meta.len() > MAX_FILE_SIZE {
            return Err(format!("file too large ({} bytes, max {})", meta.len(), MAX_FILE_SIZE));
        }

        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("read failed: {e}"))?;

        Ok(VaultContent {
            relative_path: relative_path.to_string(),
            content,
            size: meta.len(),
        })
    }

    /// Search .md files by name (case-insensitive) recursively.
    pub fn search(vault_root: &str, query: &str) -> Result<Vec<VaultFile>, String> {
        let root = PathBuf::from(vault_root)
            .canonicalize()
            .map_err(|e| format!("invalid vault path: {e}"))?;

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        Self::search_recursive(&root, &root, &query_lower, &mut results)?;
        Ok(results)
    }

    fn search_recursive(
        root: &PathBuf,
        dir: &PathBuf,
        query: &str,
        results: &mut Vec<VaultFile>,
    ) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| format!("read_dir: {e}"))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Skip hidden directories (like .obsidian, .git)
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    Self::search_recursive(root, &path, query, results)?;
                }
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.to_lowercase().contains(query) {
                    let meta = entry.metadata().map_err(|e| format!("metadata: {e}"))?;
                    let relative = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");
                    results.push(VaultFile {
                        name,
                        relative_path: relative,
                        size: meta.len(),
                        is_dir: false,
                    });
                }
            }
        }
        Ok(())
    }

    /// Full-text search across .md file contents. Case-insensitive.
    /// Returns files with matching lines and snippets.
    pub fn search_content(
        vault_root: &str,
        query: &str,
        max_results: Option<usize>,
    ) -> Result<Vec<VaultSearchResult>, String> {
        let root = PathBuf::from(vault_root)
            .canonicalize()
            .map_err(|e| format!("invalid vault path: {e}"))?;

        let query_lower = query.to_lowercase();
        let limit = max_results.unwrap_or(20);
        let mut results = Vec::new();
        Self::search_content_recursive(&root, &root, &query_lower, &mut results, limit)?;
        Ok(results)
    }

    fn search_content_recursive(
        root: &PathBuf,
        dir: &PathBuf,
        query: &str,
        results: &mut Vec<VaultSearchResult>,
        limit: usize,
    ) -> Result<(), String> {
        if results.len() >= limit {
            return Ok(());
        }

        let entries = std::fs::read_dir(dir).map_err(|e| format!("read_dir: {e}"))?;

        for entry in entries.flatten() {
            if results.len() >= limit {
                break;
            }

            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    Self::search_content_recursive(root, &path, query, results, limit)?;
                }
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                if meta.len() > MAX_FILE_SIZE {
                    continue;
                }

                let content = match std::fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                // Fast skip: no match anywhere in file
                if !content.to_lowercase().contains(query) {
                    continue;
                }

                let mut matches = Vec::new();
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(query) {
                        matches.push(VaultSearchMatch {
                            line_number: i + 1,
                            line_content: truncate_line(line, 200),
                        });
                        if matches.len() >= 5 {
                            break;
                        }
                    }
                }

                if !matches.is_empty() {
                    let relative = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");
                    results.push(VaultSearchResult {
                        name: entry.file_name().to_string_lossy().into(),
                        relative_path: relative,
                        size: meta.len(),
                        matches,
                    });
                }
            }
        }
        Ok(())
    }
}

fn truncate_line(line: &str, max_len: usize) -> String {
    if line.len() <= max_len {
        line.to_string()
    } else {
        format!("{}...", &line[..max_len])
    }
}
