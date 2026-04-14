import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

interface FlowEdgeData {
  status?: "idle" | "translating" | "success" | "error";
  [key: string]: unknown;
}

function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as FlowEdgeData | undefined;
  const status = edgeData?.status ?? "idle";
  const stroke = (style?.stroke as string) ?? "#7c3aed";

  const isTranslating = status === "translating";
  const isSuccess = status === "success";
  const isError = status === "error";

  // Active color overrides
  const activeStroke = isTranslating
    ? "#a78bfa"
    : isSuccess
      ? "#34d399"
      : isError
        ? "#f87171"
        : stroke;

  return (
    <>
      {/* Glow layer behind the edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={activeStroke}
        strokeWidth={isTranslating ? 10 : 6}
        strokeOpacity={isTranslating ? 0.3 : 0.15}
        filter="blur(4px)"
      >
        {isTranslating && (
          <animate
            attributeName="stroke-opacity"
            values="0.15;0.4;0.15"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Main edge path */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: activeStroke,
          strokeWidth: 2,
        }}
      />

      {/* Animated flowing dots */}
      <circle
        r={isTranslating ? 4 : 3}
        fill={activeStroke}
        opacity={0.9}
      >
        <animateMotion
          dur={isTranslating ? "0.8s" : "2s"}
          repeatCount="indefinite"
          path={edgePath}
        />
      </circle>
      <circle
        r={isTranslating ? 4 : 3}
        fill={activeStroke}
        opacity={0.5}
      >
        <animateMotion
          dur={isTranslating ? "0.8s" : "2s"}
          repeatCount="indefinite"
          path={edgePath}
          begin={isTranslating ? "-0.4s" : "-1s"}
        />
      </circle>

      {/* Extra dots when translating for visual density */}
      {isTranslating && (
        <>
          <circle r="3" fill={activeStroke} opacity={0.7}>
            <animateMotion
              dur="0.8s"
              repeatCount="indefinite"
              path={edgePath}
              begin="-0.2s"
            />
          </circle>
          <circle r="3" fill={activeStroke} opacity={0.4}>
            <animateMotion
              dur="0.8s"
              repeatCount="indefinite"
              path={edgePath}
              begin="-0.6s"
            />
          </circle>
        </>
      )}
    </>
  );
}

export default memo(FlowEdge);
