import { useCallback, useEffect, type ComponentType } from "react";
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
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import TerminalNode from "./nodes/TerminalNode";
import NoteNode from "./nodes/NoteNode";
import VSCodeNode from "./nodes/VSCodeNode";
import ObsidianNode from "./nodes/ObsidianNode";
import BrowserNode from "./nodes/BrowserNode";
import KanbanNode from "./nodes/KanbanNode";
import ApiNode from "./nodes/ApiNode";
import DbNode from "./nodes/DbNode";
import MonacoNode from "./nodes/MonacoNode";
import MarkdownNode from "./nodes/MarkdownNode";
import ArchitectNode from "./nodes/ArchitectNode";
import ProjectGroupNode from "./nodes/ProjectGroupNode";
import NodeErrorBoundary from "./nodes/NodeErrorBoundary";
import FlowEdge from "./edges/FlowEdge";
import StatusBar from "./StatusBar";
import ProjectNavigator from "./ProjectNavigator";
import { useCanvasSync } from "../hooks/useCanvasSync";
import { useHibernation } from "../hooks/useHibernation";
import { useViewportCulling } from "../hooks/useViewportCulling";
import { useBroadcast } from "../hooks/useBroadcast";
import { useCwdCascade } from "../hooks/useCwdCascade";
import { useCanvasStore } from "../store/canvasStore";
import type { TerminalNodeData, NoteNodeData, GroupNodeData } from "../types";

// HOC: wraps each node type with an Error Boundary so a crash in one
// node doesn't tear down the entire React Flow canvas.
function withErrorBoundary(Wrapped: ComponentType<NodeProps>) {
  return function ErrorBoundaryNode(props: NodeProps) {
    return (
      <NodeErrorBoundary nodeId={props.id}>
        <Wrapped {...props} />
      </NodeErrorBoundary>
    );
  };
}

const NODE_EDGE_COLORS: Record<string, string> = {
  Leader: "#10b981",
  Coder: "#3b82f6",
  Agent: "#A855F7",
  CyberSec: "#ef4444",
};

const nodeTypes: NodeTypes = {
  terminal: withErrorBoundary(TerminalNode),
  note: withErrorBoundary(NoteNode),
  vscode: withErrorBoundary(VSCodeNode),
  obsidian: withErrorBoundary(ObsidianNode),
  browser: withErrorBoundary(BrowserNode),
  kanban: withErrorBoundary(KanbanNode),
  api: withErrorBoundary(ApiNode),
  db: withErrorBoundary(DbNode),
  monaco: withErrorBoundary(MonacoNode),
  markdown: withErrorBoundary(MarkdownNode),
  architect: withErrorBoundary(ArchitectNode),
  group: withErrorBoundary(ProjectGroupNode),
};

const edgeTypes: EdgeTypes = {
  default: FlowEdge,
};

export default function Canvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect: storeConnect,
    setViewport,
    loaded,
    load,
    save,
  } = useCanvasStore();

  const { getNode, getNodes, setNodes } = useReactFlow();
  const { syncDebounced } = useCanvasSync();
  useHibernation();
  useViewportCulling();
  useBroadcast();
  useCwdCascade();

  useEffect(() => { load(); }, [load]);

  // Magnetic edges: allow any node-to-node connection except self-loops.
  // Type-specific logic (cwd cascade, URL injection, edge color) lives in
  // onConnect + useCwdCascade — not in validation. Connect first, specialize after.
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    [],
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const sourceNode = getNode(params.source);
      const targetNode = getNode(params.target);

      let stroke = "#A855F7";
      if (sourceNode?.type === "note") {
        const noteData = sourceNode.data as NoteNodeData;
        stroke = noteData.commandMode ? "#A855F7" : "#f59e0b";
      } else if (sourceNode?.type === "vscode") stroke = "#06b6d4";
      else if (sourceNode?.type === "obsidian") stroke = "#a855f7";
      else if (sourceNode?.type === "browser") stroke = "#f43f5e";
      else if (sourceNode?.type === "kanban") stroke = "#10b981";
      else if (sourceNode?.type === "api") stroke = "#f97316";
      else if (sourceNode?.type === "db") stroke = "#0ea5e9";
      else if (sourceNode?.type === "monaco") stroke = "#6366f1";
      else if (sourceNode?.type === "markdown") stroke = "#64748b";
      else if (sourceNode?.type === "architect") stroke = "#8b5cf6";
      else if (sourceNode?.type === "terminal") {
        const role = (sourceNode.data as TerminalNodeData)?.role ?? "Agent";
        stroke = NODE_EDGE_COLORS[role] ?? "#A855F7";
      }
      storeConnect(params, stroke);

      // Path cascade (vscode/terminal/obsidian -> terminal)
      // is handled reactively by useCwdCascade. Only non-path smart-context
      // lives here.

      // Smart Context: VSCode -> Browser injects default dev URL (Vite :5173)
      if (
        sourceNode?.type === "vscode" &&
        targetNode?.type === "browser"
      ) {
        const devUrl = "http://localhost:5173";
        setNodes((nds) =>
          nds.map((n) =>
            n.id === params.target
              ? { ...n, data: { ...n.data, url: devUrl } }
              : n,
          ),
        );
      }

      syncDebounced();
    },
    [storeConnect, syncDebounced, getNode, setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      if (changes.some((c) => c.type === "remove")) syncDebounced();
    },
    [onEdgesChange, syncDebounced],
  );

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      setViewport(viewport);
      save();
    },
    [setViewport, save],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      if (draggedNode.type === "group") return;
      const allNodes = getNodes();
      const groupNodes = allNodes.filter((n) => n.type === "group");

      let absX = draggedNode.position.x;
      let absY = draggedNode.position.y;
      if (draggedNode.parentId) {
        const parent = allNodes.find((n) => n.id === draggedNode.parentId);
        if (parent) { absX += parent.position.x; absY += parent.position.y; }
      }

      const nodeW = (draggedNode.style?.width as number) ?? 300;
      const nodeH = (draggedNode.style?.height as number) ?? 200;
      const centerX = absX + nodeW / 2;
      const centerY = absY + nodeH / 2;

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
        const group = allNodes.find((n) => n.id === targetGroup)!;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? { ...n, parentId: targetGroup, position: { x: absX - group.position.x, y: absY - group.position.y } }
              : n,
          ),
        );
        syncDebounced();
      } else if (!targetGroup && currentParent) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? { ...n, parentId: undefined, position: { x: absX, y: absY } }
              : n,
          ),
        );
        syncDebounced();
      }
    },
    [getNodes, setNodes, syncDebounced],
  );

  return (
    <div
      className="w-full h-full"
      style={{
        background: `radial-gradient(ellipse 80% 50% at 50% -20%, var(--mx-canvas-glow), transparent), var(--mx-bg)`,
      }}
    >
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
        defaultEdgeOptions={{ animated: true, style: { stroke: "#A855F7" } }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Panel position="bottom-center">
          <StatusBar />
        </Panel>

        <Panel position="top-right">
          <ProjectNavigator />
        </Panel>

        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.8}
          color="var(--mx-grid-dot)"
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "note") return "#f59e0b";
            if (node.type === "vscode") return "#06b6d4";
            if (node.type === "obsidian") return "#a855f7";
            if (node.type === "browser") return "#f43f5e";
            if (node.type === "kanban") return "#10b981";
            if (node.type === "api") return "#f97316";
            if (node.type === "db") return "#0ea5e9";
            if (node.type === "monaco") return "#6366f1";
            if (node.type === "markdown") return "#64748b";
            if (node.type === "architect") return "#8b5cf6";
            if (node.type === "group") return (node.data as GroupNodeData)?.color ?? "#3b82f6";
            return "#A855F7";
          }}
          maskColor="rgba(10, 10, 15, 0.85)"
          style={{ borderRadius: 8, background: "#18181b" }}
          pannable
          zoomable
          nodeStrokeWidth={0}
        />
      </ReactFlow>
    </div>
  );
}
