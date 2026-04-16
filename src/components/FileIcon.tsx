import {
  File,
  FileCode,
  FileText,
  FileImage,
  FileTerminal,
  FileSpreadsheet,
  Braces,
  Hash,
  Cog,
  Package,
  Lock,
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";

interface FileIconProps {
  name: string;
  isDir: boolean;
  isOpen?: boolean;
  size?: number;
}

const EXT_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  // TypeScript / JavaScript
  ts: { icon: FileCode, color: "#3b82f6" },
  tsx: { icon: FileCode, color: "#3b82f6" },
  js: { icon: FileCode, color: "#eab308" },
  jsx: { icon: FileCode, color: "#eab308" },
  mjs: { icon: FileCode, color: "#eab308" },
  cjs: { icon: FileCode, color: "#eab308" },

  // Python
  py: { icon: FileCode, color: "#22c55e" },

  // Rust / Go / C
  rs: { icon: FileCode, color: "#f97316" },
  go: { icon: FileCode, color: "#06b6d4" },
  c: { icon: FileCode, color: "#64748b" },
  cpp: { icon: FileCode, color: "#64748b" },
  h: { icon: FileCode, color: "#64748b" },
  java: { icon: FileCode, color: "#f97316" },
  rb: { icon: FileCode, color: "#ef4444" },
  php: { icon: FileCode, color: "#8b5cf6" },
  swift: { icon: FileCode, color: "#f97316" },
  lua: { icon: FileCode, color: "#3b82f6" },

  // Data / Config
  json: { icon: Braces, color: "#a855f7" },
  jsonc: { icon: Braces, color: "#a855f7" },
  yaml: { icon: FileText, color: "#f59e0b" },
  yml: { icon: FileText, color: "#f59e0b" },
  toml: { icon: Cog, color: "#94a3b8" },
  xml: { icon: FileCode, color: "#f97316" },

  // Web
  html: { icon: FileCode, color: "#f43f5e" },
  css: { icon: Hash, color: "#ec4899" },
  scss: { icon: Hash, color: "#ec4899" },
  less: { icon: Hash, color: "#ec4899" },
  svg: { icon: FileImage, color: "#f59e0b" },

  // Docs
  md: { icon: FileText, color: "#64748b" },
  mdx: { icon: FileText, color: "#64748b" },
  txt: { icon: FileText, color: "#94a3b8" },

  // Shell
  sh: { icon: FileTerminal, color: "#22c55e" },
  bash: { icon: FileTerminal, color: "#22c55e" },
  zsh: { icon: FileTerminal, color: "#22c55e" },
  bat: { icon: FileTerminal, color: "#22c55e" },
  ps1: { icon: FileTerminal, color: "#3b82f6" },

  // Images
  png: { icon: FileImage, color: "#8b5cf6" },
  jpg: { icon: FileImage, color: "#8b5cf6" },
  jpeg: { icon: FileImage, color: "#8b5cf6" },
  gif: { icon: FileImage, color: "#8b5cf6" },
  webp: { icon: FileImage, color: "#8b5cf6" },
  ico: { icon: FileImage, color: "#8b5cf6" },

  // Lock / env
  lock: { icon: Lock, color: "#94a3b8" },
  env: { icon: Lock, color: "#ef4444" },

  // Data
  csv: { icon: FileSpreadsheet, color: "#22c55e" },
  sql: { icon: FileSpreadsheet, color: "#0ea5e9" },

  // GraphQL
  graphql: { icon: FileCode, color: "#e535ab" },
  gql: { icon: FileCode, color: "#e535ab" },
};

// Special filenames (exact match, case-insensitive)
const NAME_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  "package.json": { icon: Package, color: "#22c55e" },
  "package-lock.json": { icon: Lock, color: "#94a3b8" },
  "tsconfig.json": { icon: Cog, color: "#3b82f6" },
  "tailwind.config.js": { icon: Cog, color: "#06b6d4" },
  "tailwind.config.ts": { icon: Cog, color: "#06b6d4" },
  "vite.config.ts": { icon: Cog, color: "#a855f7" },
  "vite.config.js": { icon: Cog, color: "#a855f7" },
  ".gitignore": { icon: FileText, color: "#f97316" },
  ".env": { icon: Lock, color: "#ef4444" },
  ".env.local": { icon: Lock, color: "#ef4444" },
  ".env.development": { icon: Lock, color: "#ef4444" },
  ".env.production": { icon: Lock, color: "#ef4444" },
  dockerfile: { icon: Package, color: "#0ea5e9" },
  "docker-compose.yml": { icon: Package, color: "#0ea5e9" },
  "docker-compose.yaml": { icon: Package, color: "#0ea5e9" },
  makefile: { icon: Cog, color: "#94a3b8" },
};

export default function FileIcon({
  name,
  isDir,
  isOpen = false,
  size = 14,
}: FileIconProps) {
  if (isDir) {
    const Icon = isOpen ? FolderOpen : Folder;
    return <Icon size={size} color="#f59e0b" strokeWidth={1.5} />;
  }

  const lowerName = name.toLowerCase();
  const ext = lowerName.includes(".")
    ? lowerName.split(".").pop() ?? ""
    : "";

  // Check exact filename first
  const byName = NAME_MAP[lowerName];
  if (byName) {
    return <byName.icon size={size} color={byName.color} strokeWidth={1.5} />;
  }

  // Check extension
  const byExt = EXT_MAP[ext];
  if (byExt) {
    return <byExt.icon size={size} color={byExt.color} strokeWidth={1.5} />;
  }

  // Default
  return <File size={size} color="var(--mx-text-muted)" strokeWidth={1.5} />;
}
