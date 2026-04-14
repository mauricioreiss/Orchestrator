import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type OnConnect,
  type EdgeChange,
  type IsValidConnection,
  type Viewport,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import TerminalNode from "./nodes/TerminalNode";
import NoteNode from "./nodes/NoteNode";
import VSCodeNode from "./nodes/VSCodeNode";
import ObsidianNode from "./nodes/ObsidianNode";
import ProjectGroupNode from "./nodes/ProjectGroupNode";
import FlowEdge from "./edges/FlowEdge";
import Toolbar from "./Toolbar";
import { useCanvasSync } from "../hooks/useCanvasSync";
import { useHibernation } from "../hooks/useHibernation";
import { useViewportCulling } from "../hooks/useViewportCulling";
import { useCanvasStore } from "../store/canvasStore";
import type { TerminalNodeData, GroupNodeData } from "../types";

const NODE_EDGE_COLORS: Record<string, string> = {
  Leader: "#10b981",
  Coder: "#3b82f6",
  Agent: "#7c3aed",
  CyberSec: "#ef4444",
};

const nodeTypes: NodeTypes = {
  terminal: TerminalNode,
  note: NoteNode,
  vscode: VSCodeNode,
  obsidian: ObsidianNode,
  group: ProjectGroupNode,
};

const edgeTypes: EdgeTypes = {
  default: FlowEdge,
};

let noteCounter = 0;
let vscodeCounter = 0;
let obsidianCounter = 0;
let groupCounter = 0;

export default function Canvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect: storeConnect,
    addNode,
    setViewport,
    loaded,
    load,
    save,
  } = useCanvasStore();

  const terminalCount = useRef(0);
  const { getNode, getNodes, setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  useHibernation();
  useViewportCulling();

  // Load saved state on mount
  useEffect(() => {
    load();
  }, [load]);

  // Sync counters from loaded state
  useEffect(() => {
    if (loaded) {
      const termCount = nodes.filter((n) => n.type === "terminal").length;
      const noteCount = nodes.filter((n) => n.type === "note").length;
      const vsCount = nodes.filter((n) => n.type === "vscode").length;
      const obsCount = nodes.filter((n) => n.type === "obsidian").length;
      const grpCount = nodes.filter((n) => n.type === "group").length;
      terminalCount.current = termCount;
      noteCounter = noteCount;
      vscodeCounter = vsCount;
      obsidianCounter = obsCount;
      groupCounter = grpCount;
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edge validation: only allow valid source→target combinations
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const source = getNode(connection.source);
      const target = getNode(connection.target);
      if (!source || !target) return false;

      const s = source.type;
      const t = target.type;

      // Groups don't participate in edges
      if (s === "group" || t === "group") return false;

      if (s === "note" && t === "terminal") return true;
      if (s === "vscode" && t === "terminal") return true;
      if (s === "terminal" && t === "terminal") return true;
      if (s === "obsidian" && t === "terminal") return true;
      return false;
    },
    [getNode],
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const sourceNode = getNode(params.source);
      let stroke = "#7c3aed";
      if (sourceNode?.type === "note") stroke = "#f59e0b";
      else if (sourceNode?.type === "vscode") stroke = "#06b6d4";
      else if (sourceNode?.type === "obsidian") stroke = "#a855f7";
      else if (sourceNode?.type === "terminal") {
        const role = (sourceNode.data as TerminalNodeData)?.role ?? "Agent";
        stroke = NODE_EDGE_COLORS[role] ?? "#7c3aed";
      }

      storeConnect(params, stroke);
      syncDebounced();
    },
    [storeConnect, syncDebounced, getNode],
  );

  // Detect edge removals and trigger sync
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      const hasRemoval = changes.some((c) => c.type === "remove");
      if (hasRemoval) syncDebounced();
    },
    [onEdgesChange, syncDebounced],
  );

  // Save viewport on pan/zoom
  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      setViewport(viewport);
      save();
    },
    [setViewport, save],
  );

  // Auto-parent: when a node is dropped on a group, it becomes a child
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      if (draggedNode.type === "group") return;

      const allNodes = getNodes();
      const groupNodes = allNodes.filter((n) => n.type === "group");

      // Compute absolute position of the dragged node
      let absX = draggedNode.position.x;
      let absY = draggedNode.position.y;
      if (draggedNode.parentId) {
        const parent = allNodes.find((n) => n.id === draggedNode.parentId);
        if (parent) {
          absX += parent.position.x;
          absY += parent.position.y;
        }
      }

      const nodeW = (draggedNode.style?.width as number) ?? 300;
      const nodeH = (draggedNode.style?.height as number) ?? 200;
      const centerX = absX + nodeW / 2;
      const centerY = absY + nodeH / 2;

      // Find which group contains the center of the dragged node
      let targetGroup: string | undefined;
      for (const g of groupNodes) {
        const gx = g.position.x;
        const gy = g.position.y;
        const gw = (g.style?.width as number) ?? 1200;
        const gh = (g.style?.height as number) ?? 800;

        if (centerX >= gx && centerX <= gx + gw && centerY >= gy && centerY <= gy + gh) {
          targetGroup = g.id;
          break;
        }
      }

      const currentParent = draggedNode.parentId as string | undefined;

      if (targetGroup && targetGroup !== currentParent) {
        // Parent the node: convert to relative position
        const group = allNodes.find((n) => n.id === targetGroup)!;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  parentId: targetGroup,
                  position: {
                    x: absX - group.position.x,
                    y: absY - group.position.y,
                  },
                }
              : n,
          ),
        );
        syncDebounced();
      } else if (!targetGroup && currentParent) {
        // Unparent: convert to absolute position
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  parentId: undefined,
                  position: { x: absX, y: absY },
                }
              : n,
          ),
        );
        syncDebounced();
      }
    },
    [getNodes, setNodes, syncDebounced],
  );

  const addTerminalNode = useCallback(() => {
    terminalCount.current += 1;
    addNode({
      id: crypto.randomUUID(),
      type: "terminal",
      position: {
        x: 100 + Math.random() * 600,
        y: 100 + Math.random() * 400,
      },
      data: {
        type: "terminal",
        label: `Terminal ${terminalCount.current}`,
        role: "Agent",
      },
      style: { width: 520, height: 360 },
    });
  }, [addNode]);

  const addNoteNode = useCallback(() => {
    noteCounter += 1;
    addNode({
      id: crypto.randomUUID(),
      type: "note",
      position: {
        x: 50 + Math.random() * 400,
        y: 50 + Math.random() * 300,
      },
      data: {
        type: "note",
        label: `Note ${noteCounter}`,
        content: "",
        priority: 1,
      },
      style: { width: 350, height: 250 },
    });
  }, [addNode]);

  const addVSCodeNode = useCallback(() => {
    vscodeCounter += 1;
    addNode({
      id: crypto.randomUUID(),
      type: "vscode",
      position: {
        x: 50 + Math.random() * 300,
        y: 50 + Math.random() * 200,
      },
      data: {
        type: "vscode",
        label: `VS Code ${vscodeCounter}`,
        workspacePath: "",
      },
      style: { width: 700, height: 500 },
    });
  }, [addNode]);

  const addObsidianNode = useCallback(() => {
    obsidianCounter += 1;
    addNode({
      id: crypto.randomUUID(),
      type: "obsidian",
      position: {
        x: 80 + Math.random() * 400,
        y: 80 + Math.random() * 300,
      },
      data: {
        type: "obsidian",
        label: `Vault ${obsidianCounter}`,
        vaultPath: "",
      },
      style: { width: 380, height: 400 },
    });
  }, [addNode]);

  const addGroupNode = useCallback(() => {
    groupCounter += 1;
    addNode({
      id: crypto.randomUUID(),
      type: "group",
      position: {
        x: 50 + Math.random() * 200,
        y: 50 + Math.random() * 200,
      },
      data: {
        type: "group",
        label: `Project ${groupCounter}`,
        color: "#3b82f6",
      },
      style: { width: 1200, height: 800, zIndex: -1 },
    });
  }, [addNode]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onMoveEnd={handleMoveEnd}
        onNodeDragStop={onNodeDragStop}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={!loaded || nodes.length === 0}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true, style: { stroke: "#7c3aed" } }}
        className="bg-mx-bg"
        minZoom={0.1}
        maxZoom={2}
      >
        <Panel position="top-center">
          <Toolbar
            onAddTerminal={addTerminalNode}
            onAddNote={addNoteNode}
            onAddVSCode={addVSCodeNode}
            onAddObsidian={addObsidianNode}
            onAddGroup={addGroupNode}
            nodeCount={nodes.length}
          />
        </Panel>

        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#2a2a4a"
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "note") return "#f59e0b";
            if (node.type === "vscode") return "#06b6d4";
            if (node.type === "obsidian") return "#a855f7";
            if (node.type === "group") return (node.data as GroupNodeData)?.color ?? "#3b82f6";
            return "#7c3aed";
          }}
          maskColor="rgba(15, 15, 26, 0.8)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
