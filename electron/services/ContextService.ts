import crypto from "crypto";
import type {
  CanvasGraph,
  CanvasNode,
  CanvasEdge,
  ContextAction,
} from "../types";

// ---------------------------------------------------------------------------
// Hash helper: MD5 hex digest for content dedup
// ---------------------------------------------------------------------------

function hashStr(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

// ---------------------------------------------------------------------------
// Helper: extract ptyId from a node's data bag
// ---------------------------------------------------------------------------

function getPtyId(node: CanvasNode): string | null {
  const raw = node.data?.ptyId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function getContent(node: CanvasNode): string {
  // Notes store content in `content`, obsidian in `content` too (may be null)
  const c = node.data?.content;
  return typeof c === "string" ? c : "";
}

function getLabel(node: CanvasNode): string {
  const l = node.data?.label;
  return typeof l === "string" ? l : "";
}

function getWorkspacePath(node: CanvasNode): string {
  const w = node.data?.workspacePath ?? node.data?.workspace;
  return typeof w === "string" ? w : "";
}

function getRole(node: CanvasNode): string {
  const r = node.data?.role;
  return typeof r === "string" ? r : "Agent";
}

function getPriority(node: CanvasNode): number {
  const p = node.data?.priority;
  return typeof p === "number" ? p : 0;
}

// ---------------------------------------------------------------------------
// ContextService (Maestro Bus)
//
// Receives full graph snapshots from the frontend, diffs against the previous
// state, and produces a list of actions to execute. Single source of truth
// for context propagation:
//   - Note / Obsidian -> Terminal: content injection with priority ordering
//   - VSCode -> Terminal: workspace directory propagation
//   - Terminal -> Terminal: pipe output
//   - Edge removal detection: interrupt + clear
// ---------------------------------------------------------------------------

export class ContextService {
  private prevGraph: CanvasGraph | null = null;

  /** "noteId:terminalId" -> content hash for dedup */
  private dispatched = new Map<string, string>();

  /** terminalNodeId -> last cwd sent */
  private cwdSent = new Map<string, string>();

  /** Return the last synced graph snapshot (used by broadcast handler). */
  getLastGraph(): CanvasGraph | null {
    return this.prevGraph;
  }

  /**
   * Diff the new graph against the previous state and return actions.
   */
  sync(graph: CanvasGraph): ContextAction[] {
    const actions: ContextAction[] = [];
    const oldGraph = this.prevGraph;

    // Build node lookup
    const nodeMap = new Map<string, CanvasNode>();
    for (const n of graph.nodes) nodeMap.set(n.id, n);

    // -----------------------------------------------------------------------
    // 1. Note -> Terminal: dispatch or re-dispatch on content change
    // -----------------------------------------------------------------------
    const noteEdges = graph.edges.filter(
      (e) => e.sourceType === "note" && e.targetType === "terminal",
    );

    for (const edge of noteEdges) {
      const note = nodeMap.get(edge.source);
      const terminal = nodeMap.get(edge.target);
      if (!note || !terminal) continue;

      const content = getContent(note);
      const ptyId = getPtyId(terminal);
      if (!ptyId || !content.trim()) continue;

      const key = `${note.id}:${terminal.id}`;
      const hash = hashStr(content);
      const prev = this.dispatched.get(key);
      if (prev === hash) continue;

      this.dispatched.set(key, hash);

      actions.push({
        type: "dispatch_note",
        ptyId,
        noteId: note.id,
        terminalId: terminal.id,
        content,
        priority: getPriority(note),
        isLeaderContext: false,
      });
    }

    // -----------------------------------------------------------------------
    // 1b. Obsidian -> Terminal: dispatch vault content (same pattern, priority=1)
    // -----------------------------------------------------------------------
    const obsidianEdges = graph.edges.filter(
      (e) => e.sourceType === "obsidian" && e.targetType === "terminal",
    );

    for (const edge of obsidianEdges) {
      const obs = nodeMap.get(edge.source);
      const terminal = nodeMap.get(edge.target);
      if (!obs || !terminal) continue;

      const content = getContent(obs);
      const ptyId = getPtyId(terminal);
      if (!ptyId || !content.trim()) continue;

      const key = `${obs.id}:${terminal.id}`;
      const hash = hashStr(content);
      const prev = this.dispatched.get(key);
      if (prev === hash) continue;

      this.dispatched.set(key, hash);

      actions.push({
        type: "dispatch_note",
        ptyId,
        noteId: obs.id,
        terminalId: terminal.id,
        content,
        priority: 1,
        isLeaderContext: false,
      });
    }

    // -----------------------------------------------------------------------
    // 1c. Leader context aggregation: Note -> Leader terminal gathers Obsidian
    //     knowledge connected to the same leader and injects it at priority 0.
    // -----------------------------------------------------------------------
    for (const edge of noteEdges) {
      const terminal = nodeMap.get(edge.target);
      if (!terminal) continue;

      const role = getRole(terminal);
      const ptyId = getPtyId(terminal);
      if (role !== "Leader" || !ptyId) continue;

      // Gather all Obsidian nodes connected to this leader terminal
      const obsidianParts: string[] = [];
      for (const e of graph.edges) {
        if (e.target !== terminal.id || e.sourceType !== "obsidian") continue;
        const obsNode = nodeMap.get(e.source);
        if (!obsNode) continue;
        const c = getContent(obsNode);
        if (!c.trim()) continue;
        obsidianParts.push(`--- ${getLabel(obsNode)} ---\n${c}`);
      }

      if (obsidianParts.length === 0) continue;

      const aggregated = obsidianParts.join("\n\n");
      const key = `leader-ctx:${terminal.id}`;
      const hash = hashStr(aggregated);
      const prev = this.dispatched.get(key);
      if (prev === hash) continue;

      this.dispatched.set(key, hash);

      actions.push({
        type: "dispatch_note",
        ptyId,
        noteId: `__leader_ctx_${terminal.id}`,
        terminalId: terminal.id,
        content: aggregated,
        priority: 0,
        isLeaderContext: true,
      });
    }

    // -----------------------------------------------------------------------
    // Priority sort: higher number first so P1 (most important) is injected LAST
    // -----------------------------------------------------------------------
    actions.sort((a, b) => {
      const pa = a.type === "dispatch_note" ? a.priority : -1;
      const pb = b.type === "dispatch_note" ? b.priority : -1;
      return pb - pa;
    });

    // -----------------------------------------------------------------------
    // 2. Detect disconnected note/obsidian -> terminal edges -> interrupt + clear
    // -----------------------------------------------------------------------
    if (oldGraph) {
      for (const oldEdge of oldGraph.edges) {
        const isContentEdge =
          (oldEdge.sourceType === "note" ||
            oldEdge.sourceType === "obsidian") &&
          oldEdge.targetType === "terminal";
        if (!isContentEdge) continue;

        const stillExists = graph.edges.some(
          (e) => e.source === oldEdge.source && e.target === oldEdge.target,
        );
        if (stillExists) continue;

        // Edge was removed. Look up terminal in the OLD graph (it may have
        // been deleted from the new graph too).
        const terminal = oldGraph.nodes.find((n) => n.id === oldEdge.target);
        if (!terminal) continue;

        const ptyId = getPtyId(terminal);
        if (ptyId) {
          actions.push({ type: "interrupt", ptyId });
          actions.push({ type: "clear_instruction", ptyId });
        }

        const key = `${oldEdge.source}:${oldEdge.target}`;
        this.dispatched.delete(key);
      }
    }

    // -----------------------------------------------------------------------
    // 3. VSCode -> Terminal: cwd propagation (only on actual change)
    // -----------------------------------------------------------------------
    const vscodeEdges = graph.edges.filter(
      (e) => e.sourceType === "vscode" && e.targetType === "terminal",
    );

    for (const edge of vscodeEdges) {
      const vscode = nodeMap.get(edge.source);
      if (!vscode) continue;

      const workspace = getWorkspacePath(vscode);
      if (!workspace) continue;

      const alreadySent = this.cwdSent.get(edge.target) === workspace;
      if (alreadySent) continue;

      const terminal = nodeMap.get(edge.target);
      const ptyId = terminal ? getPtyId(terminal) : undefined;

      actions.push({
        type: "set_cwd",
        terminalNodeId: edge.target,
        ptyId: ptyId ?? undefined,
        cwd: workspace,
      });
      this.cwdSent.set(edge.target, workspace);
    }

    // Clean up cwdSent for terminals no longer connected to vscode
    const vscodeTargets = new Set(vscodeEdges.map((e) => e.target));
    for (const key of this.cwdSent.keys()) {
      if (!vscodeTargets.has(key)) {
        this.cwdSent.delete(key);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Terminal -> Terminal: auto-pipe output on every sync
    // -----------------------------------------------------------------------
    for (const edge of graph.edges) {
      if (edge.sourceType !== "terminal" || edge.targetType !== "terminal")
        continue;

      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const srcPty = getPtyId(source);
      const tgtPty = getPtyId(target);
      if (!srcPty || !tgtPty) continue;

      actions.push({
        type: "pipe_output",
        sourcePtyId: srcPty,
        targetPtyId: tgtPty,
      });
    }

    // Store current graph as previous for next diff
    this.prevGraph = {
      nodes: [...graph.nodes],
      edges: [...graph.edges],
      version: graph.version,
    };

    return actions;
  }
}
