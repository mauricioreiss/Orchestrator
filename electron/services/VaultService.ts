import fs from "fs";
import path from "path";
import type {
  VaultFile,
  VaultContent,
  VaultSearchMatch,
  VaultSearchResult,
} from "../types";

const MAX_FILE_SIZE = 65536; // 64KB
const HIDDEN_DIRS = new Set([".obsidian", ".git", ".trash"]);

/**
 * Stateless file system reader for Obsidian vaults.
 * All methods are stateless -- no mutable instance state.
 * Security: every path operation validates against directory traversal.
 */
export class VaultService {
  /**
   * Resolve and validate that a path stays within the vault root.
   * Throws on traversal attempts or invalid paths.
   */
  private safeResolve(canonicalRoot: string, sub: string): string {
    const resolved = path.resolve(canonicalRoot, sub);
    const canonical = fs.realpathSync(resolved);
    if (!canonical.startsWith(canonicalRoot)) {
      throw new Error("path traversal denied");
    }
    return canonical;
  }

  /**
   * Convert an absolute path to a vault-relative path with forward slashes.
   */
  private toRelative(root: string, absolute: string): string {
    return path.relative(root, absolute).split(path.sep).join("/");
  }

  /**
   * List .md files and subdirectories in a vault folder.
   * Directories first, then files, both sorted alphabetically (case-insensitive).
   * Skips hidden dirs (.obsidian, .git, .trash).
   */
  listFiles(vaultRoot: string, subfolder?: string): VaultFile[] {
    const root = fs.realpathSync(path.resolve(vaultRoot));

    const target =
      subfolder != null ? this.safeResolve(root, subfolder) : root;

    const entries = fs.readdirSync(target, { withFileTypes: true });
    const files: VaultFile[] = [];

    for (const entry of entries) {
      const isDir = entry.isDirectory();
      const fullPath = path.join(target, entry.name);

      if (isDir) {
        // Skip hidden directories
        if (HIDDEN_DIRS.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
      } else {
        // Only include .md files
        if (path.extname(entry.name).toLowerCase() !== ".md") {
          continue;
        }
      }

      const stat = fs.statSync(fullPath);
      const relativePath = this.toRelative(root, fullPath);

      files.push({
        name: entry.name,
        relative_path: relativePath,
        size: isDir ? 0 : stat.size,
        is_dir: isDir,
      });
    }

    // Directories first, then files, both sorted case-insensitively
    files.sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return files;
  }

  /**
   * Read a single file's content. Max 64KB.
   * Security: path traversal prevention via safeResolve.
   */
  readFile(vaultRoot: string, relativePath: string): VaultContent {
    const root = fs.realpathSync(path.resolve(vaultRoot));
    const filePath = this.safeResolve(root, relativePath);

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error("not a file");
    }
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `file too large (${stat.size} bytes, max ${MAX_FILE_SIZE})`
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");

    return {
      relative_path: relativePath,
      content,
      size: stat.size,
    };
  }

  /**
   * Search .md files by name (case-insensitive) recursively.
   * Skips hidden directories.
   */
  search(vaultRoot: string, query: string): VaultFile[] {
    const root = fs.realpathSync(path.resolve(vaultRoot));
    const queryLower = query.toLowerCase();
    const results: VaultFile[] = [];
    this.searchRecursive(root, root, queryLower, results);
    return results;
  }

  private searchRecursive(
    root: string,
    dir: string,
    query: string,
    results: VaultFile[]
  ): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) {
          this.searchRecursive(root, fullPath, query, results);
        }
      } else if (path.extname(entry.name).toLowerCase() === ".md") {
        if (entry.name.toLowerCase().includes(query)) {
          let stat: fs.Stats;
          try {
            stat = fs.statSync(fullPath);
          } catch {
            continue;
          }
          results.push({
            name: entry.name,
            relative_path: this.toRelative(root, fullPath),
            size: stat.size,
            is_dir: false,
          });
        }
      }
    }
  }

  /**
   * Full-text search across .md file contents. Case-insensitive.
   * Returns files with matching lines and snippets.
   * Max 5 matches per file, max `maxResults` files (default 20), max 200 chars per line.
   */
  searchContent(
    vaultRoot: string,
    query: string,
    maxResults?: number
  ): VaultSearchResult[] {
    const root = fs.realpathSync(path.resolve(vaultRoot));
    const queryLower = query.toLowerCase();
    const limit = maxResults ?? 20;
    const results: VaultSearchResult[] = [];
    this.searchContentRecursive(root, root, queryLower, results, limit);
    return results;
  }

  private searchContentRecursive(
    root: string,
    dir: string,
    query: string,
    results: VaultSearchResult[],
    limit: number
  ): void {
    if (results.length >= limit) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= limit) break;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) {
          this.searchContentRecursive(root, fullPath, query, results, limit);
        }
        continue;
      }

      if (path.extname(entry.name).toLowerCase() !== ".md") continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) continue;

      let content: string;
      try {
        content = fs.readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      // Fast skip: no match anywhere in the file
      if (!content.toLowerCase().includes(query)) continue;

      const matches: VaultSearchMatch[] = [];
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query)) {
          matches.push({
            line_number: i + 1,
            line_content: truncateLine(lines[i], 200),
          });
          if (matches.length >= 5) break;
        }
      }

      if (matches.length > 0) {
        results.push({
          name: entry.name,
          relative_path: this.toRelative(root, fullPath),
          size: stat.size,
          matches,
        });
      }
    }
  }
}

/** Truncate a line to maxLen characters, appending "..." if truncated. */
function truncateLine(line: string, maxLen: number): string {
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen) + "...";
}
