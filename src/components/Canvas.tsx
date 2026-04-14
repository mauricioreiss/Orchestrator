import { useCallback, useEffect } from "react";
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
import BrowserNode from "./nodes/BrowserNode";
import KanbanNode from "./nodes/KanbanNode";
import ApiNode from "./nodes/ApiNode";
import DbNode from "./nodes/DbNode";
import ProjectGroupNode from "./nodes/ProjectGroupNode";
import FlowEdge from "./edges/FlowEdge";
import StatusBar from "./StatusBar";
import { useCanvasSync } from "../hooks/useCanvasSync";
import { useHibernation } from "../hooks/useHibernation";
import { useViewportCulling } from "../hooks/useViewportCulling";
import { useCanvasStore } from "../store/canvasStore";
import type { TerminalNodeData, NoteNodeData, GroupNodeData } from "../types";

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
  browser: BrowserNode,
  kanban: KanbanNode,
  api: ApiNode,
  db: DbNode,
  group: ProjectGroupNode,
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

  useEffect(() => { load(); }, [load]);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const source = getNode(connection.source);
      const target = getNode(connection.target);
      if (!source || !target) return false;
      const s = source.type;
      const t = target.type;
      if (s === "group" || t === "group") return false;
      if (s === "note" && t === "terminal") return true;
      if (s === "vscode" && t === "terminal") return true;
      if (s === "terminal" && t === "terminal") return true;
      if (s === "obsidian" && t === "terminal") return true;
      if (s === "browser" && t === "terminal") return true;
      if (s === "kanban" && t === "terminal") return true;
      if (s === "api" && t === "terminal") return true;
      if (s === "db" && t === "terminal") return true;
      return false;
    },
    [getNode],
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const sourceNode = getNode(params.source);
      let stroke = "#7c3aed";
      if (sourceNode?.type === "note") {
        const noteData = sourceNode.data as NoteNodeData;
        stroke = noteData.commandMode ? "#7c3aed" : "#f59e0b";
      } else if (sourceNode?.type === "vscode") stroke = "#06b6d4";
      else if (sourceNode?.type === "obsidian") stroke = "#a855f7";
      else if (sourceNode?.type === "browser") stroke = "#f43f5e";
      else if (sourceNode?.type === "kanban") stroke = "#10b981";
      else if (sourceNode?.type === "api") stroke = "#f97316";
      else if (sourceNode?.type === "db") stroke = "#0ea5e9";
      else if (sourceNode?.type === "terminal") {
        const role = (sourceNode.data as TerminalNodeData)?.role ?? "Agent";
        stroke = NODE_EDGE_COLORS[role] ?? "#7c3aed";
      }
      storeConnect(params, stroke);
      syncDebounced();
    },
    [storeConnect, syncDebounced, getNode],
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
        <Panel position="bottom-center">
          <StatusBar />
        </Panel>

        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--mx-border-strong)"
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
            if (node.type === "group") return (node.data as GroupNodeData)?.color ?? "#3b82f6";
            return "#7c3aed";
          }}
          maskColor="rgba(10, 10, 15, 0.8)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
