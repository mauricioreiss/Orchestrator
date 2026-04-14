import type { PtyService } from "./PtyService";
import type { CodeServerService } from "./CodeServerService";
import type { CleanupResult, RemovedNode } from "../types";

// ---------------------------------------------------------------------------
// SupervisorService
//
// Centralized process lifecycle coordinator. Wraps PtyService and
// CodeServerService to guarantee cleanup when nodes are deleted from
// the canvas. Idempotent: killing an already-dead PTY or stopping a
// stopped server is a no-op.
// ---------------------------------------------------------------------------

export class SupervisorService {
  constructor(
    private pty: PtyService,
    private codeServer: CodeServerService,
  ) {}

  /**
   * Clean up processes for removed nodes.
   * Called from the `cleanup_nodes` IPC handler when the frontend
   * detects node deletions via `onNodesChange`.
   */
  cleanupNodes(removed: RemovedNode[]): CleanupResult {
    let killedPtys = 0;
    let stoppedServers = 0;

    for (const node of removed) {
      switch (node.node_type) {
        case "terminal": {
          if (node.process_id) {
            try {
              this.pty.kill(node.process_id);
              killedPtys++;
            } catch {
              // PTY already dead, ignore
            }
          }
          break;
        }
        case "vscode": {
          try {
            this.codeServer.stop(node.node_id);
            stoppedServers++;
          } catch {
            // Server already stopped, ignore
          }
          break;
        }
        default:
          // note, obsidian, group, browser, kanban, api, db: no process to clean
          break;
      }
    }

    return { killed_ptys: killedPtys, stopped_servers: stoppedServers };
  }
}
