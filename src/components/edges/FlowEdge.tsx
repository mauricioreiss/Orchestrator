import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const stroke = (style?.stroke as string) ?? "#7c3aed";

  return (
    <>
      {/* Glow layer behind the edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={6}
        strokeOpacity={0.15}
        filter="blur(4px)"
      />

      {/* Main edge path */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
        }}
      />

      {/* Animated flowing dot */}
      <circle r="3" fill={stroke} opacity={0.9}>
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <circle r="3" fill={stroke} opacity={0.5}>
        <animateMotion
          dur="2s"
          repeatCount="indefinite"
          path={edgePath}
          begin="-1s"
        />
      </circle>
    </>
  );
}

export default memo(FlowEdge);
