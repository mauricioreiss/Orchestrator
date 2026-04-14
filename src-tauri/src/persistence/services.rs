use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

use super::models::{CanvasSummary, SavedCanvas};

/// Manages SQLite persistence for canvas state.
///
/// The database file lives in the app's data directory (per-user).
/// Schema: single `canvases` table with JSON blob storage.
pub struct PersistenceManager {
    conn: Mutex<Connection>,
}

impl PersistenceManager {
    /// Open (or create) the SQLite database and run migrations.
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("failed to create data dir: {e}"))?;

        let db_path = data_dir.join("maestri-x.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("failed to open database: {e}"))?;

        // WAL mode for better concurrent read/write performance
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| format!("WAL pragma failed: {e}"))?;

        // Create table if not exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS canvases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .map_err(|e| format!("migration failed: {e}"))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Save or update a canvas state.
    pub fn save(&self, id: &str, name: &str, data: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO canvases (id, name, data, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                data = excluded.data,
                updated_at = datetime('now')",
            rusqlite::params![id, name, data],
        )
        .map_err(|e| format!("save failed: {e}"))?;
        Ok(())
    }

    /// Load a canvas by ID.
    pub fn load(&self, id: &str) -> Result<Option<SavedCanvas>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, data, updated_at FROM canvases WHERE id = ?1")
            .map_err(|e| format!("prepare failed: {e}"))?;

        let result = stmt
            .query_row(rusqlite::params![id], |row| {
                Ok(SavedCanvas {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    data: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })
            .optional()
            .map_err(|e| format!("load failed: {e}"))?;

        Ok(result)
    }

    /// List all saved canvases (without data blob).
    pub fn list(&self) -> Result<Vec<CanvasSummary>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, updated_at FROM canvases ORDER BY updated_at DESC")
            .map_err(|e| format!("prepare failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(CanvasSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            })
            .map_err(|e| format!("list failed: {e}"))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| format!("row read failed: {e}"))?);
        }
        Ok(result)
    }

    /// Delete a canvas by ID.
    pub fn delete(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM canvases WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("delete failed: {e}"))?;
        Ok(())
    }
}

/// Extension trait for rusqlite to get optional results.
trait OptionalExt<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalExt<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
