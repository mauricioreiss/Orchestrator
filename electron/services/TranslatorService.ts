import fs from "fs";
import path from "path";
import type { BrowserWindow } from "electron";
import type { PtyService } from "./PtyService";
import type { PersistenceService } from "./PersistenceService";
import type { TranslateResult } from "../types";

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

type AiProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5-20250929",
};

function parseProvider(s: string | null): AiProvider {
  return s === "anthropic" ? "anthropic" : "openai";
}

// ---------------------------------------------------------------------------
// Navigation patterns for local intercept (pt-BR + en)
// ---------------------------------------------------------------------------

/** Raw cd command: cd <target> */
const CD_RE = /^cd\s+(.+)$/i;

/** Natural language navigation patterns */
const NAV_RE =
  /^(?:acesse|entre\s+na\s+pasta|vai\s+para|va\s+para|abra|open|navigate\s+to|go\s+to)\s+(?:a\s+pasta\s+|o\s+diretorio\s+|a\s+)?(.+)$/i;

// ---------------------------------------------------------------------------
// TranslatorService
//
// AI-powered translation of natural language notes to shell commands.
// Local intercept catches navigation patterns without any API call.
// Falls back to OpenAI or Anthropic for general command translation.
// ---------------------------------------------------------------------------

export class TranslatorService {
  /**
   * Translate a note's content into a shell command and inject it into the PTY.
   *
   * Flow:
   * 1. Try local intercept (fuzzy navigation) -- zero token cost
   * 2. Read AI provider settings from SQLite
   * 3. Call AI API to translate note -> command
   * 4. Sanitize LLM output (strip code fences, prompts)
   * 5. Write the command + \r\n to the target PTY
   * 6. Emit context-injection event to renderer
   * 7. Return the translated command to frontend
   */
  async translateAndInject(
    noteContent: string,
    ptyId: string,
    cwd: string,
    role: string,
    persistence: PersistenceService,
    pty: PtyService,
    window: BrowserWindow | null,
  ): Promise<TranslateResult> {
    // 1. Try local intercept before calling LLM
    const localCmd = tryLocalIntercept(noteContent, cwd);
    if (localCmd) {
      console.log(`[maestri-x] Local intercept: ${localCmd}`);
      pty.write(ptyId, Array.from(Buffer.from(`${localCmd}\r\n`, "utf-8")));

      // Emit context-injection for the renderer to show the command
      const formatted = formatTranslation(localCmd, "local", "fuzzy-nav");
      window?.webContents.send(`context-injection-${ptyId}`, formatted);

      return { command: localCmd, provider: "local", model: "fuzzy-nav" };
    }

    // 2. Read settings from persistence
    const providerStr = persistence.getSetting("translator_provider");
    const apiKey = persistence.getSetting("translator_api_key");
    const modelSetting = persistence.getSetting("translator_model");

    if (!apiKey) {
      throw new Error(
        "API key not configured. Open Settings to add your key.",
      );
    }

    const provider = parseProvider(providerStr);
    const modelName = modelSetting || DEFAULT_MODELS[provider];

    console.log(
      `[maestri-x] translate_and_inject: provider=${provider}, model=${modelName}, pty=${ptyId}`,
    );

    // 3. Call AI API
    const systemPrompt = buildSystemPrompt(cwd, role);
    let rawCommand: string;

    if (provider === "openai") {
      rawCommand = await callOpenAI(apiKey, modelName, systemPrompt, noteContent);
    } else {
      rawCommand = await callAnthropic(apiKey, modelName, systemPrompt, noteContent);
    }

    console.log(`[maestri-x] Translated command (raw): ${rawCommand}`);

    // 4. Sanitize LLM output
    const clean = sanitizeLlmCommand(rawCommand);
    console.log(`[maestri-x] Sanitized command: ${clean}`);

    // 5. Write to PTY
    pty.write(ptyId, Array.from(Buffer.from(`${clean}\r\n`, "utf-8")));

    // 6. Emit context-injection event
    const formatted = formatTranslation(clean, provider, modelName);
    window?.webContents.send(`context-injection-${ptyId}`, formatted);

    return { command: clean, provider, model: modelName };
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(cwd: string, role: string): string {
  const osName = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const shell = process.platform === "win32" ? "PowerShell" : "bash";

  return (
    `You are a terminal command translator for Maestri-X orchestrator.\n` +
    `OS: ${osName}, Shell: ${shell}\n` +
    `Current directory: ${cwd}\n` +
    `Terminal role: ${role}\n\n` +
    `Translate the user's intent into a valid terminal command.\n` +
    `Return ONLY the command, no explanation, no markdown, no backticks.\n` +
    `If multiple commands needed, chain with ;\n` +
    `If intent is unclear, return the closest interpretation.\n` +
    `If untranslatable, return: echo "Cannot translate: [reason]"`
  );
}

// ---------------------------------------------------------------------------
// OpenAI API call
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 500,
    temperature: 0.1,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`OpenAI API error (${response.status}): ${text}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse OpenAI JSON: ${e}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing content");
  }

  return content.trim();
}

// ---------------------------------------------------------------------------
// Anthropic API call
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const body = {
    model,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${text}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Anthropic JSON: ${e}`);
  }

  const content = json?.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("Anthropic response missing content");
  }

  return content.trim();
}

// ---------------------------------------------------------------------------
// LLM output sanitization
// ---------------------------------------------------------------------------

function sanitizeLlmCommand(raw: string): string {
  let s = raw.trim();

  // Strip markdown code fences (```bash ... ``` or ```powershell ... ```)
  if (s.startsWith("```")) {
    const newlinePos = s.indexOf("\n");
    if (newlinePos !== -1) {
      s = s.slice(newlinePos + 1);
    } else {
      s = s.replace(/^`+/, "");
    }
  }
  if (s.endsWith("```")) {
    s = s.slice(0, -3);
  }

  s = s.trim();

  // Strip leading shell prompt chars
  if (s.startsWith("$ ")) s = s.slice(2);
  else if (s.startsWith("> ")) s = s.slice(2);
  else if (s.startsWith("PS> ")) s = s.slice(4);

  // Take only the first non-empty line
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[0] ?? s.trim();
}

// ---------------------------------------------------------------------------
// Local intercept: fuzzy navigation
// ---------------------------------------------------------------------------

function tryLocalIntercept(content: string, cwd: string): string | null {
  const trimmed = content.trim();

  // If already a raw cd command, process it
  const cdMatch = CD_RE.exec(trimmed);
  if (cdMatch) {
    const target = cdMatch[1].trim().replace(/^"|"$/g, "");

    // Absolute path, .., or drive letter: pass through directly
    if (
      target.startsWith("/") ||
      target.startsWith("\\") ||
      target.includes(":") ||
      target === ".." ||
      target.startsWith("..")
    ) {
      return `cd "${target}"`;
    }

    // Try fuzzy match on relative target
    return fuzzyResolveDir(cwd, target);
  }

  // Natural language navigation patterns
  const navMatch = NAV_RE.exec(trimmed);
  if (navMatch) {
    const target = navMatch[1].trim().replace(/^"|"$/g, "");
    return fuzzyResolveDir(cwd, target);
  }

  return null;
}

/**
 * Fuzzy-match a target name against directories in cwd.
 * Returns `cd "resolved_name"` if a good match is found, null otherwise.
 *
 * Uses simple substring + Levenshtein distance scoring since we don't have
 * the Rust skim fuzzy matcher in Node.js. The scoring is tuned to match
 * the Rust version's behavior: exact matches score highest, substring
 * matches next, then fuzzy.
 */
function fuzzyResolveDir(cwd: string, target: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cwd, { withFileTypes: true });
  } catch {
    return null;
  }

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (dirs.length === 0) return null;

  const lowerTarget = target.toLowerCase();

  let bestScore = 0;
  let bestName = "";

  for (const name of dirs) {
    const lowerName = name.toLowerCase();
    let score = 0;

    // Exact match (case insensitive)
    if (lowerName === lowerTarget) {
      score = 1000;
    }
    // Starts with target
    else if (lowerName.startsWith(lowerTarget)) {
      score = 500 + (lowerTarget.length / lowerName.length) * 100;
    }
    // Contains target as substring
    else if (lowerName.includes(lowerTarget)) {
      score = 200 + (lowerTarget.length / lowerName.length) * 100;
    }
    // Target contains name (e.g., target="components" matches "comp")
    else if (lowerTarget.includes(lowerName)) {
      score = 100 + (lowerName.length / lowerTarget.length) * 50;
    }
    // Fuzzy: check if all chars of target appear in order in name
    else {
      let ti = 0;
      let matched = 0;
      for (let ni = 0; ni < lowerName.length && ti < lowerTarget.length; ni++) {
        if (lowerName[ni] === lowerTarget[ti]) {
          matched++;
          ti++;
        }
      }
      if (ti === lowerTarget.length) {
        // All chars matched in order
        score = 20 + (matched / lowerName.length) * 30;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }

  // Minimum threshold to avoid false positives (mirrors Rust's score >= 20)
  if (bestScore >= 20 && bestName) {
    return `cd "${bestName}"`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// ANSI format for context-injection event
// ---------------------------------------------------------------------------

function formatTranslation(command: string, provider: string, model: string): string {
  return (
    `\r\n\x1b[1;36m[Maestro Translator]\x1b[0m ` +
    `\x1b[90m(${provider}/${model})\x1b[0m\r\n` +
    `\x1b[1;37m> ${command}\x1b[0m\r\n`
  );
}
