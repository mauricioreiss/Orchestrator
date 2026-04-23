import type { BrowserWindow } from "electron";
import type { PtyService } from "./PtyService";
import type { PersistenceService } from "./PersistenceService";
import log from "../log";
import type { TranslateResult, ConnectedNodeInfo } from "../types";

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
// TranslatorService
//
// Backend brain: receives natural language from NoteNode, calls AI API,
// parses SEND_TO tags, dispatches commands directly to target PTYs.
// ---------------------------------------------------------------------------

export class TranslatorService {
  /**
   * Backend brain: call AI, parse SEND_TO tags, dispatch directly to PTYs.
   *
   * Flow:
   * 1. Read AI provider settings from SQLite
   * 2. Build orchestrator prompt with ALL connected terminals
   * 3. Call AI API
   * 4. Sanitize + parse SEND_TO tags
   * 5. For each tag, write the command directly to the target PTY
   * 6. Return result to frontend
   */
  async translateAndInject(
    noteContent: string,
    connectedNodes: ConnectedNodeInfo[],
    persistence: PersistenceService,
    pty: PtyService,
    window: BrowserWindow | null,
  ): Promise<TranslateResult> {
    // 1. Read settings from persistence
    const providerStr = persistence.getSetting("translator_provider");
    const apiKey = persistence.getSecureSetting("translator_api_key");
    const modelSetting = persistence.getSetting("translator_model");

    if (!apiKey) {
      throw new Error(
        "API key not configured. Open Settings to add your key.",
      );
    }

    const provider = parseProvider(providerStr);
    const modelName = modelSetting || DEFAULT_MODELS[provider];

    log.info(
      `[orchestrated-space] translate_and_inject: provider=${provider}, model=${modelName}, targets=${connectedNodes.length}`,
    );

    // 2. Build orchestrator prompt with ALL targets
    const cwd = connectedNodes[0]?.cwd ?? process.cwd();
    const systemPrompt = buildOrchestratorPrompt(cwd, "Tech Lead", connectedNodes);
    let rawCommand: string;

    // 3. Call AI API
    if (provider === "openai") {
      rawCommand = await callOpenAI(apiKey, modelName, systemPrompt, noteContent);
    } else {
      rawCommand = await callAnthropic(apiKey, modelName, systemPrompt, noteContent);
    }

    log.info(`[orchestrated-space] AI raw response: ${rawCommand}`);

    // 4. Sanitize LLM output
    const clean = sanitizeLlmCommand(rawCommand);
    log.info(`[orchestrated-space] Sanitized: ${clean}`);

    // 5. Parse SEND_TO tags and dispatch directly to target PTYs
    const SEND_TO_RE = /<<SEND_TO:([^>\r\n]+?)>>\s*([^\r\n]+)/g;
    let dispatched = 0;
    let match: RegExpExecArray | null;

    while ((match = SEND_TO_RE.exec(clean)) !== null) {
      const targetLabel = match[1].trim();
      const command = match[2].trim();

      const targetLower = targetLabel.toLowerCase();
      const target = connectedNodes.find((n) => n.label.toLowerCase() === targetLower);
      if (target?.ptyId) {
        try {
          const cleanCommand = command.trim();
          const ptyId = target.ptyId;
          if (!pty.writeStringSafe(ptyId, cleanCommand)) continue;
          setTimeout(() => {
            try { pty.writeString(ptyId, "\x0D"); } catch { /* PTY may be dead */ }
          }, 50);
          dispatched++;
          log.info(`[orchestrated-space] Dispatched to "${targetLabel}": ${cleanCommand}`);

          // Visual feedback for frontend edge flash
          window?.webContents.send("swarm-dispatch", {
            targetPtyId: target.ptyId,
            targetLabel,
            command,
          });
        } catch {
          log.warn(`[orchestrated-space] Failed to write to PTY ${target.ptyId}`);
        }
      } else {
        log.warn(`[orchestrated-space] Target "${targetLabel}" not found in connected nodes`);
      }
    }

    // 6. Silence: if no tags found, just log — never inject garbage
    if (dispatched === 0) {
      log.warn(`[orchestrated-space] Resposta da IA sem tags SEND_TO, descartada: "${clean}"`);
    } else {
      log.info(`[orchestrated-space] Dispatched ${dispatched} command(s)`);
    }

    return { command: clean, provider, model: modelName };
  }
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
    `[SYSTEM] Você é o Tech Lead Orquestrador. Você distribui tarefas para agentes autônomos.\n` +
    `Sua equipe conectada: ${labelList}.\n` +
    `REGRA SUPREMA: Você se comunica com eles EXCLUSIVAMENTE gerando tags de roteamento.\n` +
    `Sintaxe obrigatória: <<SEND_TO:nome_da_equipe>> a instrução em linguagem natural aqui\n` +
    `Exemplo: Se o usuário pedir para o frontend criar um botão, responda APENAS:\n` +
    `<<SEND_TO:frontend>> Crie um componente de botão azul.\n\n` +
    `NUNCA explique o que está fazendo. NUNCA gere texto fora das tags.\n` +
    `NUNCA envolva as tags em aspas, crases ou blocos de código.\n` +
    `Se precisar delegar para múltiplos agentes, gere múltiplas tags, uma por linha.\n` +
    `Os nomes dos agentes são EXATAMENTE: ${labelList}. Use esses nomes exatos nas tags.\n\n` +
    `Ambiente: ${osName} / ${shell}, cwd: ${cwd}. Papel: ${role}.\n` +
    `Detalhes da equipe:\n${detailList}`
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
  const sendToLines: string[] = [];
  const otherLines: string[] = [];

  for (let line of lines) {
    // Keep SEND_TO lines as-is (smartWrite will route them)
    if (SEND_TO_RE.test(line)) {
      sendToLines.push(line);
      continue;
    }

    // Strip leading shell prompt chars
    if (line.startsWith("$ ")) line = line.slice(2);
    else if (line.startsWith("> ")) line = line.slice(2);
    else if (line.startsWith("PS> ")) line = line.slice(4);

    if (line.length > 0) otherLines.push(line);
  }

  // If response contains SEND_TO tags, ONLY keep those — drop conversational
  // chatter the AI added despite the prompt forbidding it.
  if (sendToLines.length > 0) {
    return sendToLines.join("\n");
  }

  return otherLines.join("\n") || s.trim();
}

