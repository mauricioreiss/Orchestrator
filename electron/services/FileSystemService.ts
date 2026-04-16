import fs from "fs";
import path from "path";
import log from "../log";
import type { FsEntry, FsFileContent } from "../types";

const MAX_FILE_SIZE = 1_048_576; // 1MB

const HIDDEN_DIRS = new Set([
  "node_modules", ".git", ".next", ".vscode", "dist", "build",
  "__pycache__", ".cache", ".turbo", ".parcel-cache", ".svelte-kit",
  ".nuxt", ".output", "coverage", ".nyc_output",
]);

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  json: "json", jsonc: "json",
  md: "markdown", mdx: "markdown",
  css: "css", scss: "scss", less: "less",
  html: "html", htm: "html",
  yaml: "yaml", yml: "yaml",
  toml: "ini",
  sql: "sql",
  sh: "shell", bash: "shell", zsh: "shell",
  xml: "xml", svg: "xml",
  java: "java",
  kt: "kotlin",
  c: "c", h: "c",
  cpp: "cpp", hpp: "cpp", cc: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  lua: "lua",
  r: "r",
  dockerfile: "dockerfile",
  graphql: "graphql", gql: "graphql",
};

/**
 * Stateless file system reader for project directories.
 * Modeled on VaultService. All path operations validate against traversal.
 */
export class FileSystemService {
  private safeResolve(canonicalRoot: string, sub: string): string {
    const resolved = path.resolve(canonicalRoot, sub);
    const canonical = fs.realpathSync(resolved);
    if (!canonical.startsWith(canonicalRoot)) {
      throw new Error("path traversal denied");
    }
    return canonical;
  }

  private toRelative(root: string, absolute: string): string {
    return path.relative(root, absolute).split(path.sep).join("/");
  }

  private detectLanguage(fileName: string): string {
    // Handle Dockerfile, Makefile, etc.
    const lowerName = fileName.toLowerCase();
    if (lowerName === "dockerfile") return "dockerfile";
    if (lowerName === "makefile") return "makefile";

    const ext = fileName.includes(".")
      ? fileName.split(".").pop()?.toLowerCase() ?? ""
      : "";
    return EXT_TO_LANG[ext] ?? "plaintext";
  }

  /**
   * List files and subdirectories in a project folder.
   * Dirs first, then files, both sorted alphabetically (case-insensitive).
   * Skips hidden/heavy directories (node_modules, .git, etc.).
   */
  readDirectory(rootDir: string, subfolder?: string): FsEntry[] {
    const root = fs.realpathSync(path.resolve(rootDir));
    const target = subfolder != null ? this.safeResolve(root, subfolder) : root;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(target, { withFileTypes: true });
    } catch (err) {
      log.error(`[FileSystem] readDirectory failed: ${(err as Error).message}`);
      return [];
    }

    const result: FsEntry[] = [];

    for (const entry of entries) {
      const isDir = entry.isDirectory();

      if (isDir) {
        if (HIDDEN_DIRS.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
      }

      const fullPath = path.join(target, entry.name);
      let size = 0;
      if (!isDir) {
        try {
          size = fs.statSync(fullPath).size;
        } catch {
          continue;
        }
      }

      result.push({
        name: entry.name,
        relative_path: this.toRelative(root, fullPath),
        size,
        is_dir: isDir,
      });
    }

    // Directories first, then files, both case-insensitive alphabetical
    result.sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return result;
  }

  /**
   * Read a single file's content. Max 1MB.
   * Returns content + auto-detected Monaco language.
   */
  readFile(rootDir: string, relativePath: string): FsFileContent {
    const root = fs.realpathSync(path.resolve(rootDir));
    const filePath = this.safeResolve(root, relativePath);

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error("not a file");
    }
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`file too large (${stat.size} bytes, max ${MAX_FILE_SIZE})`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const fileName = path.basename(filePath);

    return {
      relative_path: relativePath,
      content,
      size: stat.size,
      language: this.detectLanguage(fileName),
    };
  }
}
