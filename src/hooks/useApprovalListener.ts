import { useEffect } from "react";
import { toast } from "sonner";
import { listen, invoke, isElectron } from "../lib/electron";

interface ApprovalEvent {
  ptyId: string;
  nodeId: string;
  nodeLabel: string;
  command: string;
}

/**
 * Listens for agent approval requests and shows interactive toasts.
 * The agent pauses execution until the user approves or rejects.
 */
export function useApprovalListener(): void {
  useEffect(() => {
    if (!isElectron()) return;

    const unlisten = listen<ApprovalEvent>("agent-approval-request", (payload) => {
      const { ptyId, nodeLabel, command } = payload;

      toast(`${nodeLabel} requests approval`, {
        description: command,
        duration: Infinity,
        action: {
          label: "Approve",
          onClick: () => {
            invoke("approve_agent_action", { ptyId }).catch(console.error);
          },
        },
        cancel: {
          label: "Reject",
          onClick: () => {
            invoke("reject_agent_action", { ptyId }).catch(console.error);
          },
        },
      });
    });

    return unlisten;
  }, []);
}
