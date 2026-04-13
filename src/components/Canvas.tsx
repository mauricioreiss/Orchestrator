import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type NodeTypes,
  type OnConnect,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import TerminalNode from "./nodes/TerminalNode";
import Toolbar from "./Toolbar";

const nodeTypes: NodeTypes = {
  terminal: TerminalNode,
};

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const addTerminalNode = useCallback(() => {
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: "terminal",
      position: {
        x: 100 + Math.random() * 600,
        y: 100 + Math.random() * 400,
      },
      data: {
        label: `Terminal ${nodes.length + 1}`,
        role: "Agent",
      },
      style: { width: 520, height: 360 },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true, style: { stroke: "#7c3aed" } }}
        className="bg-shark-bg"
      >
        <Panel position="top-center">
          <Toolbar
            onAddTerminal={addTerminalNode}
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
          nodeColor="#7c3aed"
          maskColor="rgba(15, 15, 26, 0.8)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
