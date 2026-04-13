import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  BackgroundVariant,
  type NodeTypes,
  type OnConnect,
  type Node,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import TerminalNode from "./nodes/TerminalNode";
import NoteNode from "./nodes/NoteNode";
import VSCodeNode from "./nodes/VSCodeNode";
import Toolbar from "./Toolbar";
import { useCanvasSync } from "../hooks/useCanvasSync";

const nodeTypes: NodeTypes = {
  terminal: TerminalNode,
  note: NoteNode,
  vscode: VSCodeNode,
};

let noteCounter = 0;
let vscodeCounter = 0;

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const terminalCount = useRef(0);
  const { getNode } = useReactFlow();
  const { syncDebounced } = useCanvasSync();

  // Edge validation: only allow valid source→target combinations
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const source = getNode(connection.source);
      const target = getNode(connection.target);
      if (!source || !target) return false;

      const s = source.type;
      const t = target.type;

      if (s === "note" && t === "terminal") return true;
      if (s === "vscode" && t === "terminal") return true;
      if (s === "terminal" && t === "terminal") return true;
      return false;
    },
    [getNode],
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const sourceNode = getNode(params.source);
      let stroke = "#7c3aed"; // default purple (terminal→terminal)
      if (sourceNode?.type === "note") stroke = "#f59e0b"; // amber
      if (sourceNode?.type === "vscode") stroke = "#06b6d4"; // cyan

      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke } }, eds),
      );
      syncDebounced();
    },
    [setEdges, syncDebounced, getNode],
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

  const addTerminalNode = useCallback(() => {
    terminalCount.current += 1;
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
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
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const addNoteNode = useCallback(() => {
    noteCounter += 1;
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
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
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const addVSCodeNode = useCallback(() => {
    vscodeCounter += 1;
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
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
      style: { width: 350, height: 160 },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true, style: { stroke: "#7c3aed" } }}
        className="bg-mx-bg"
      >
        <Panel position="top-center">
          <Toolbar
            onAddTerminal={addTerminalNode}
            onAddNote={addNoteNode}
            onAddVSCode={addVSCodeNode}
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
            return "#7c3aed";
          }}
          maskColor="rgba(15, 15, 26, 0.8)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
