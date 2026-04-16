import fs from "fs";
import path from "path";
import type { BrowserWindow } from "electron";
import type { PtyService } from "./PtyService";
import type { PersistenceService } from "./PersistenceService";
import type { ContextService } from "./ContextService";
import log from "../log";
import type { TranslateResult, CanvasGraph, ConnectedNodeInfo } from "../types";

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
    connectedNodes: ConnectedNodeInfo[],
    persistence: PersistenceService,
    pty: PtyService,
    context: ContextService,
    window: BrowserWindow | null,
  ): Promise<TranslateResult> {
    // 1. Try local intercept before calling LLM
    const localCmd = tryLocalIntercept(noteContent, cwd);
    if (localCmd) {
      log.info(`[orchestrated-space] Local intercept: ${localCmd}`);
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

    log.info(
      `[orchestrated-space] translate_and_inject: provider=${provider}, model=${modelName}, pty=${ptyId}`,
    );

    // 3. Call AI API (with FRESH graph context from frontend)
    //    connectedNodes comes from Zustand state at IPC call time — no
    //    staleness from the debounced sync_canvas snapshot.
    const graph = context.getLastGraph();
    const systemPrompt = connectedNodes.length > 0
      ? buildOrchestratorPrompt(cwd, role, connectedNodes)
      : buildSystemPrompt(cwd, role, buildSwarmContext(ptyId, graph));
    let rawCommand: string;

    if (provider === "openai") {
      rawCommand = await callOpenAI(apiKey, modelName, systemPrompt, noteContent);
    } else {
      rawCommand = await callAnthropic(apiKey, modelName, systemPrompt, noteContent);
    }

    log.info(`[orchestrated-space] Translated command (raw): ${rawCommand}`);

    // 4. Sanitize LLM output
    const clean = sanitizeLlmCommand(rawCommand);
    log.info(`[orchestrated-space] Sanitized command: ${clean}`);

    // 5. Smart Write — intercepts <<SEND_TO:...>> and routes to target PTYs
    const swResult = pty.smartWrite(ptyId, clean, graph, window);
    if (swResult.dispatched > 0) {
      log.info(`[orchestrated-space] Swarm routed ${swResult.dispatched} command(s)`);
    }

    // 6. Emit context-injection event (show what the AI generated)
    const formatted = formatTranslation(clean, provider, modelName);
    window?.webContents.send(`context-injection-${ptyId}`, formatted);

    return { command: clean, provider, model: modelName };
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(cwd: string, role: string, swarmContext: string): string {
  const osName = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const shell = process.platform === "win32" ? "PowerShell" : "bash";

  let prompt =
    `You are a terminal command translator for Orchestrated Space orchestrator.\n` +
    `OS: ${osName}, Shell: ${shell}\n` +
    `Current directory: ${cwd}\n` +
    `Terminal role: ${role}\n\n` +
    `Translate the user's intent into a valid terminal command.\n` +
    `Return ONLY the command, no explanation, no markdown, no backticks.\n` +
    `If multiple commands needed, chain with ;\n` +
    `If intent is unclear, return the closest interpretation.\n` +
    `If untranslatable, return: echo "Cannot translate: [reason]"`;

  if (swarmContext) {
    prompt += "\n\n" + swarmContext;
  }

  return prompt;
}

/**
 * Orchestrator prompt (PT-BR) — used when the frontend provides a fresh
 * snapshot of connected subordinate nodes via `connectedNodes`. The AI
 * reads the exact `label` values sent by the frontend, so there's no
 * hallucination risk from stale backend graph state.
 */
function buildOrchestratorPrompt(
  cwd: string,
  role: string,
  connectedNodes: ConnectedNodeInfo[],
): string {
  const osName = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const shell = process.platform === "win32" ? "PowerShell" : "bash";

  const labelList = connectedNodes.map((n) => n.label).join(", ");
  const detailList = connectedNodes
    .map((n) => {
      const parts = [`"${n.label}" (${n.type})`];
      if (n.cwd) parts.push(`cwd: ${n.cwd}`);
      return `- ${parts.join(", ")}`;
    })
    .join("\n");

  return (
    `[SYSTEM] Você é o Agente Orquestrador Principal. Seus subordinados são outros agentes de IA (Claude Code CLI rodando em terminais interativos).\n` +
    `Subordinados disponíveis: ${labelList}.\n` +
    `Para delegar trabalho, você DEVE usar OBRIGATORIAMENTE a sintaxe: <<SEND_TO:NomeDoSubordinado>> prompt_em_linguagem_natural_aqui.\n` +
    `O prompt é texto conversacional, NÃO é um comando shell. Exemplo: <<SEND_TO:frontend>> Crie a tela de login com validação de email.\n` +
    `Regras:\n` +
    `- Escreva prompts em português, claros e acionáveis, como se estivesse pedindo a um colega desenvolvedor.\n` +
    `- Uma tag por linha. Se precisar delegar para dois subordinados, gere duas tags em linhas separadas.\n` +
    `- NUNCA adicione texto conversacional na mesma linha da tag. A tag e o prompt devem ser a ÚNICA coisa naquela linha. Seus comentários para o usuário vão em linhas separadas ANTES ou DEPOIS.\n` +
    `- NUNCA envolva a tag ou o prompt em aspas, crases, ou blocos de código markdown (\`\`\`). Escreva a tag e o prompt crus no texto.\n` +
    `- Responda ao usuário brevemente sobre o que você está delegando.\n\n` +
    `Seu papel: ${role}. Seu ambiente: ${osName} / ${shell}, cwd: ${cwd}.\n` +
    `Detalhes dos subordinados:\n${detailList}`
  );
}

/**
 * Build swarm context string for the AI system prompt.
 * Lists all terminal neighbors so the AI knows who it can send commands to.
 */
function buildSwarmContext(ptyId: string, graph: CanvasGraph | null): string {
  if (!graph) return "";

  // Find source node
  const sourceNode = graph.nodes.find(
    (n) => n.type === "terminal" && n.data?.ptyId === ptyId,
  );
  if (!sourceNode) return "";

  const sourceLabel = (typeof sourceNode.data?.label === "string")
    ? sourceNode.data.label
    : "Terminal";

  // Find all neighbors via bidirectional edges
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === sourceNode.id) neighborIds.add(edge.target);
    if (edge.target === sourceNode.id) neighborIds.add(edge.source);
  }

  // Collect terminal neighbors with their metadata
  const neighbors: string[] = [];
  for (const nId of neighborIds) {
    const node = graph.nodes.find((n) => n.id === nId);
    if (!node || node.type !== "terminal") continue;

    const label = typeof node.data?.label === "string" ? node.data.label : "Terminal";
    const cwd = typeof node.data?.cwd === "string" ? node.data.cwd : "unknown";
    neighbors.push(`- "${label}" (terminal, cwd: ${cwd})`);
  }

  if (neighbors.length === 0) return "";

  return (
    `SWARM CONTEXT:\n` +
    `You are the terminal "${sourceLabel}".\n` +
    `Connected terminals:\n` +
    neighbors.join("\n") + "\n\n" +
    `To execute commands on connected terminals, respond with EXACTLY:\n` +
    `<<SEND_TO:NodeName>> command\n` +
    `Write the tag on a separate line. No markdown code blocks around it.\n` +
    `You may combine local commands with SEND_TO lines (one per line).`
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

  // Process each line: strip prompts, keep SEND_TO lines and non-empty commands
  const SEND_TO_RE = /^<<SEND_TO:.+?>>\s*.+$/;
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  const cleaned: string[] = [];

  for (let line of lines) {
    // Keep SEND_TO lines as-is (smartWrite will route them)
    if (SEND_TO_RE.test(line)) {
      cleaned.push(line);
      continue;
    }

    // Strip leading shell prompt chars
    if (line.startsWith("$ ")) line = line.slice(2);
    else if (line.startsWith("> ")) line = line.slice(2);
    else if (line.startsWith("PS> ")) line = line.slice(4);

    if (line.length > 0) cleaned.push(line);
  }

  return cleaned.join("\n") || s.trim();
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
