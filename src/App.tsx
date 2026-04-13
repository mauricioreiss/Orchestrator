import { ReactFlowProvider } from "@xyflow/react";
import Canvas from "./components/Canvas";

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="w-full h-full bg-mx-bg">
        <Canvas />
      </div>
    </ReactFlowProvider>
  );
}
