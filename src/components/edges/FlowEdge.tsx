import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

interface FlowEdgeData {
  status?: "idle" | "translating" | "success" | "error" | "broadcasting" | "dispatching";
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
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 15,
  });

  const edgeData = data as FlowEdgeData | undefined;
  const status = edgeData?.status ?? "idle";
  const stroke = (style?.stroke as string) ?? "#A855F7";

  const isBroadcasting = status === "broadcasting";
  const isDispatching = status === "dispatching";
  const isTranslating = status === "translating";
  const isSuccess = status === "success";
  const isError = status === "error";

  // Active color overrides
  const activeStroke = isBroadcasting
    ? "#10b981"
    : isDispatching
      ? "#22d3ee"
      : isTranslating
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
        strokeWidth={(isBroadcasting || isDispatching) ? 12 : isTranslating ? 10 : 6}
        strokeOpacity={(isBroadcasting || isDispatching) ? 0.4 : isTranslating ? 0.3 : 0.15}
        filter="blur(4px)"
      >
        {(isBroadcasting || isDispatching || isTranslating) && (
          <animate
            attributeName="stroke-opacity"
            values={(isBroadcasting || isDispatching) ? "0.2;0.5;0.2" : "0.15;0.4;0.15"}
            dur={(isBroadcasting || isDispatching) ? "0.6s" : "1s"}
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
        r={(isBroadcasting || isDispatching) ? 4.5 : isTranslating ? 4 : 3}
        fill={activeStroke}
        opacity={0.9}
      >
        <animateMotion
          dur={(isBroadcasting || isDispatching) ? "0.5s" : isTranslating ? "0.8s" : "2s"}
          repeatCount="indefinite"
          path={edgePath}
        />
      </circle>
      <circle
        r={(isBroadcasting || isDispatching) ? 4 : isTranslating ? 4 : 3}
        fill={activeStroke}
        opacity={0.5}
      >
        <animateMotion
          dur={(isBroadcasting || isDispatching) ? "0.5s" : isTranslating ? "0.8s" : "2s"}
          repeatCount="indefinite"
          path={edgePath}
          begin={(isBroadcasting || isDispatching) ? "-0.25s" : isTranslating ? "-0.4s" : "-1s"}
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

      {/* Dispatch/Broadcast cascade: fast dots with staggered timing */}
      {(isBroadcasting || isDispatching) && (
        <>
          <circle r="3.5" fill={activeStroke} opacity={0.8}>
            <animateMotion dur="0.5s" repeatCount="indefinite" path={edgePath} begin="-0.1s" />
          </circle>
          <circle r="3" fill={activeStroke} opacity={0.65}>
            <animateMotion dur="0.5s" repeatCount="indefinite" path={edgePath} begin="-0.2s" />
          </circle>
          <circle r="3" fill={activeStroke} opacity={0.5}>
            <animateMotion dur="0.5s" repeatCount="indefinite" path={edgePath} begin="-0.3s" />
          </circle>
          <circle r="2.5" fill={activeStroke} opacity={0.35}>
            <animateMotion dur="0.5s" repeatCount="indefinite" path={edgePath} begin="-0.4s" />
          </circle>
        </>
      )}
    </>
  );
}

export default memo(FlowEdge);
