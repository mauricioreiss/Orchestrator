import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { SavedCanvas, CanvasSummary } from "../types";

/**
 * SQLite persistence for canvas state and settings.
 * Uses better-sqlite3 prepared statements for all operations.
 */
export class PersistenceService {
  private db: Database.Database;

  // Prepared statements, created once and reused
  private stmtSave: Database.Statement;
  private stmtLoad: Database.Statement;
  private stmtList: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtGetSetting: Database.Statement;
  private stmtSetSetting: Database.Statement;
  private stmtGetAllSettings: Database.Statement;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "maestri-x.db"));
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS canvases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Pre-compile all statements
    this.stmtSave = this.db.prepare(`
      INSERT INTO canvases (id, name, data, updated_at)
      VALUES (@id, @name, @data, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        data = excluded.data,
        updated_at = datetime('now')
    `);

    this.stmtLoad = this.db.prepare(
      "SELECT id, name, data, updated_at FROM canvases WHERE id = @id"
    );

    this.stmtList = this.db.prepare(
      "SELECT id, name, updated_at FROM canvases ORDER BY updated_at DESC"
    );

    this.stmtDelete = this.db.prepare("DELETE FROM canvases WHERE id = @id");

    this.stmtGetSetting = this.db.prepare(
      "SELECT value FROM settings WHERE key = @key"
    );

    this.stmtSetSetting = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    this.stmtGetAllSettings = this.db.prepare(
      "SELECT key, value FROM settings ORDER BY key"
    );
  }

  /** Save or update a canvas state (upsert). */
  save(id: string, name: string, data: string): void {
    this.stmtSave.run({ id, name, data });
  }

  /** Load a canvas by ID. Returns null if not found. */
  load(id: string): SavedCanvas | null {
    const row = this.stmtLoad.get({ id }) as SavedCanvas | undefined;
    return row ?? null;
  }

  /** List all saved canvases (without the data blob). Ordered by updated_at DESC. */
  list(): CanvasSummary[] {
    return this.stmtList.all() as CanvasSummary[];
  }

  /** Delete a canvas by ID. */
  delete(id: string): void {
    this.stmtDelete.run({ id });
  }

  /** Get a single setting value by key. Returns null if not found. */
  getSetting(key: string): string | null {
    const row = this.stmtGetSetting.get({ key }) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  /** Set a setting value (upsert). */
  setSetting(key: string, value: string): void {
    this.stmtSetSetting.run({ key, value });
  }

  /** Get all settings as [key, value] tuples, ordered by key. */
  getAllSettings(): Array<[string, string]> {
    const rows = this.stmtGetAllSettings.all() as Array<{
      key: string;
      value: string;
    }>;
    return rows.map((r) => [r.key, r.value]);
  }

  /** Close the database connection. Call on app quit. */
  close(): void {
    this.db.close();
  }
}
