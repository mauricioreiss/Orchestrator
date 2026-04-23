import log from "../log";
import type { PersistenceService } from "./PersistenceService";

// ---------------------------------------------------------------------------
// Provider config (mirrors TranslatorService, independent copy to avoid
// coupling with the protected orchestrator service)
// ---------------------------------------------------------------------------

type AiProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5-20250929",
};

function parseProvider(s: string | null): AiProvider {
  return s === "anthropic" ? "anthropic" : "openai";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DossierResult {
  dossier: string;
  ignitionPrompt: string;
}

// ---------------------------------------------------------------------------
// System Prompts
// ---------------------------------------------------------------------------

function buildInterviewPrompt(projectName?: string): string {
  const projectCtx = projectName ? `O projeto se chama "${projectName}".` : "";
  return (
    `Voce e um Arquiteto de Software Senior entrevistando o usuario sobre um projeto.\n` +
    `${projectCtx}\n` +
    `Seu objetivo: coletar informacao suficiente para customizar uma persona de IA para este projeto.\n\n` +
    `Faca 2-3 perguntas estrategicas por vez. Foque em:\n` +
    `1. Stack tecnico (linguagens, frameworks, banco de dados, infra)\n` +
    `2. Arquitetura (monolito vs microservicos, APIs, filas, cache)\n` +
    `3. Dominio de negocio (o que o sistema faz, regras criticas, areas sensiveis)\n` +
    `4. Workflow (CI/CD, testes, deploy, ambientes)\n` +
    `5. Restricoes e riscos (deadlines, legacy, compliance, performance)\n\n` +
    `Seja direto. Perguntas curtas. Nao repita o que o usuario ja disse.\n` +
    `Quando tiver informacao suficiente (geralmente apos 2-3 rodadas), escreva "INTERVIEW_COMPLETE" na PRIMEIRA linha da sua resposta, seguido de um resumo breve do que coletou.`
  );
}

function buildDossierPrompt(): string {
  return (
    `Voce recebe: (1) um template de persona em markdown e (2) respostas de uma entrevista sobre o projeto.\n` +
    `Sua tarefa: preencher e customizar o template com as informacoes do projeto.\n\n` +
    `Regras:\n` +
    `- Mantenha a estrutura e secoes do template original\n` +
    `- Substitua placeholders e exemplos genericos com informacoes reais do projeto\n` +
    `- Adicione regras de protecao baseadas nas respostas (arquivos criticos, pipeline, dominio)\n` +
    `- Adicione guardrails especificos do dominio de negocio\n` +
    `- O resultado DEVE ser um markdown completo e funcional, pronto para uso\n` +
    `- Escreva em pt-BR para texto, English para codigo/variaveis\n\n` +
    `Apos o markdown do dossie, adicione uma linha com exatamente:\n` +
    `---IGNITION_PROMPT---\n` +
    `Seguida de um prompt de inicializacao (1-2 frases) que o usuario vai colar no terminal do Claude Code para ativar a persona. Exemplo:\n` +
    `"Leia o arquivo .contexto_ia.md na raiz do projeto. Assuma a persona descrita, carregue as memorias e confirme quando estiver pronto para codar."`
  );
}

function buildArchitectPrompt(projectName?: string): string {
  const projectCtx = projectName ? `O projeto se chama "${projectName}".` : "";
  return (
    `Voce e um Principal Solutions Architect. ` +
    `Seu objetivo: entrevistar o desenvolvedor para entender o projeto a fundo ` +
    `e, ao final, gerar arquivos markdown de persona separados por dominio.\n` +
    `${projectCtx}\n\n` +

    `═══════════════════════════════════════\n` +
    `FASE 1 — ENTREVISTA TECNICA\n` +
    `═══════════════════════════════════════\n\n` +

    `REGRAS DA ENTREVISTA:\n` +
    `- NAO faca uma lista com 10 perguntas de uma vez.\n` +
    `- Faca de 1 a 2 perguntas curtas e diretas por interacao.\n` +
    `- Seja conversacional, tecnico e direto ao ponto.\n` +
    `- Se o usuario der uma resposta curta, deduza as melhores praticas para aquela stack, mas peca confirmacao.\n` +
    `- Nao repita informacao que o usuario ja forneceu.\n\n` +

    `Suas perguntas devem cobrir gradualmente (nao tudo de uma vez):\n` +
    `1. Objetivo principal do projeto (o que o sistema faz, qual problema resolve)\n` +
    `2. Stack exata — Frontend (ex: Next.js + Tailwind) e Backend (ex: FastAPI + PostgreSQL)\n` +
    `3. Gerenciamento de Estado (ex: Zustand, Redux, Context API, Pinia)\n` +
    `4. Padroes de API e Autenticacao (REST, GraphQL, tRPC, JWT, OAuth, session cookies)\n` +
    `5. Regras de negocio criticas ou integracoes externas (Stripe, AWS S3, SendGrid, etc.)\n` +
    `6. Estrutura de pastas e convencoes de codigo existentes\n` +
    `7. Pipeline de CI/CD, testes, ambientes (staging, production)\n` +
    `8. Restricoes tecnicas (legacy, compliance, performance, deadlines)\n\n` +

    `PRINCIPIO FUNDAMENTAL:\n` +
    `Separar personas por dominio evita alucinacoes. Uma IA com contexto "Full-Stack" ` +
    `confunde regras de backend com frontend, mistura convencoes e gera codigo incorreto. ` +
    `Personas focadas em um unico dominio = respostas precisas e sem contaminacao cruzada.\n\n` +

    `Na segunda rodada, explique brevemente ao usuario que voce vai SEPARAR as personas ` +
    `por dominio para maximizar precisao e evitar alucinacoes entre contextos.\n\n` +

    `QUANDO ENCERRAR A ENTREVISTA:\n` +
    `Quando voce tiver informacoes suficientes de Front e Back para criar "Guardrails" ` +
    `estritos (limites do que a IA pode e nao pode fazer em cada dominio), anuncie ao ` +
    `usuario que vai gerar as personas e prossiga para a Fase 2.\n\n` +

    `═══════════════════════════════════════\n` +
    `FASE 2 — GERACAO DE PERSONAS\n` +
    `═══════════════════════════════════════\n\n` +

    `FORMATO DE SAIDA (OBRIGATORIO):\n` +
    `Use tags XML para cada arquivo. Exemplo:\n\n` +
    `<file name="frontend_persona.md">\n` +
    `(conteudo markdown completo da persona frontend)\n` +
    `</file>\n\n` +
    `<file name="backend_persona.md">\n` +
    `(conteudo markdown completo da persona backend)\n` +
    `</file>\n\n` +

    `Cada persona DEVE conter:\n` +
    `- Identidade e escopo (qual parte do sistema essa persona domina)\n` +
    `- Stack especifico desse dominio com versoes quando informadas\n` +
    `- Instrucoes de codigo limpo e arquitetura escolhida\n` +
    `- Guardrails estritos: o que a persona PODE e NAO PODE fazer\n` +
    `- Limites de dominio claros (ex: "O Front NAO toca em banco de dados")\n` +
    `- Arquivos e componentes criticos (protegidos) DESSE dominio\n` +
    `- Convencoes de codigo especificas (naming, imports, patterns)\n` +
    `- Regras de seguranca relevantes ao dominio\n\n` +

    `REGRAS:\n` +
    `- Minimo 2 personas (mesmo projetos simples tem frontend + backend)\n` +
    `- O atributo name do <file> DEVE terminar em _persona.md\n` +
    `- NUNCA gere as tags <file> antes de ter informacao suficiente\n` +
    `- NUNCA misture as tags <file> em respostas que nao contenham as personas finais\n` +
    `- Escreva em pt-BR para texto, English para codigo e nomes tecnicos`
  );
}

// ---------------------------------------------------------------------------
// PersonaArchitectService
// ---------------------------------------------------------------------------

export class PersonaArchitectService {
  /**
   * Multi-turn chat: send the full conversation history + system prompt,
   * get the assistant's next response.
   */
  async chat(
    messages: ChatMessage[],
    projectName: string | undefined,
    persistence: PersistenceService,
  ): Promise<string> {
    const { apiKey, provider, model } = this.readSettings(persistence);
    const systemPrompt = buildInterviewPrompt(projectName);

    const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    if (provider === "openai") {
      return callOpenAI(apiKey, model, systemPrompt, apiMessages, { maxTokens: 2000, temperature: 0.3 });
    } else {
      return callAnthropic(apiKey, model, systemPrompt, apiMessages, { maxTokens: 2000, temperature: 0.3 });
    }
  }

  /**
   * Architect Node chat: interview + inline dossier generation.
   * Uses a combined prompt that asks questions then generates a dossier
   * wrapped in <<<DOSSIER>>>...<<<END_DOSSIER>>> markers.
   */
  async architectChat(
    messages: ChatMessage[],
    projectName: string | undefined,
    persistence: PersistenceService,
  ): Promise<string> {
    const { apiKey, provider, model } = this.readSettings(persistence);
    const systemPrompt = buildArchitectPrompt(projectName);

    const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    if (provider === "openai") {
      return callOpenAI(apiKey, model, systemPrompt, apiMessages, { maxTokens: 8000, temperature: 0.3 });
    } else {
      return callAnthropic(apiKey, model, systemPrompt, apiMessages, { maxTokens: 8000, temperature: 0.3 });
    }
  }

  /**
   * Generate a customized dossier by fusing a persona template with
   * interview answers. Returns the dossier markdown + ignition prompt.
   */
  async generateDossier(
    template: string,
    conversation: string,
    projectName: string,
    persistence: PersistenceService,
  ): Promise<DossierResult> {
    const { apiKey, provider, model } = this.readSettings(persistence);
    const systemPrompt = buildDossierPrompt();

    const userContent =
      `## Projeto: ${projectName}\n\n` +
      `## Template de Persona:\n\n${template}\n\n` +
      `## Respostas da Entrevista:\n\n${conversation}`;

    const apiMessages = [{ role: "user" as const, content: userContent }];

    let raw: string;
    if (provider === "openai") {
      raw = await callOpenAI(apiKey, model, systemPrompt, apiMessages, { maxTokens: 4000, temperature: 0.2 });
    } else {
      raw = await callAnthropic(apiKey, model, systemPrompt, apiMessages, { maxTokens: 4000, temperature: 0.2 });
    }

    // Split on the ignition prompt delimiter
    const delimiter = "---IGNITION_PROMPT---";
    const delimIdx = raw.indexOf(delimiter);
    if (delimIdx !== -1) {
      const dossier = raw.slice(0, delimIdx).trim();
      const ignitionPrompt = raw.slice(delimIdx + delimiter.length).trim();
      return { dossier, ignitionPrompt };
    }

    // Fallback: no delimiter found, use default ignition prompt
    return {
      dossier: raw.trim(),
      ignitionPrompt: `Leia o arquivo de contexto na raiz do projeto "${projectName}". Assuma a persona descrita e confirme quando estiver pronto.`,
    };
  }

  private readSettings(persistence: PersistenceService): {
    apiKey: string;
    provider: AiProvider;
    model: string;
  } {
    const providerStr = persistence.getSetting("translator_provider");
    const apiKey = persistence.getSecureSetting("translator_api_key");
    const modelSetting = persistence.getSetting("translator_model");

    if (!apiKey) {
      throw new Error("API key not configured. Open Settings to add your key.");
    }

    const provider = parseProvider(providerStr);
    const model = modelSetting || DEFAULT_MODELS[provider];
    return { apiKey, provider, model };
  }
}

// ---------------------------------------------------------------------------
// OpenAI API call (multi-turn)
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens: number; temperature: number },
): Promise<string> {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: options.maxTokens,
    temperature: options.temperature,
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
  try { json = JSON.parse(text); } catch (e) {
    throw new Error(`Failed to parse OpenAI JSON: ${e}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing content");
  }
  return content.trim();
}

// ---------------------------------------------------------------------------
// Anthropic API call (multi-turn)
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens: number; temperature: number },
): Promise<string> {
  const body = {
    model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    system: systemPrompt,
    messages,
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
  try { json = JSON.parse(text); } catch (e) {
    throw new Error(`Failed to parse Anthropic JSON: ${e}`);
  }

  const content = json?.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("Anthropic response missing content");
  }
  return content.trim();
}
