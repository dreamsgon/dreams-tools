import type { MapDrawing, MapShape } from "@/lib/model";
import { shapePath } from "@/lib/map-drawing";
import { shapeOps, backgroundOps, type DrawOp } from "@/lib/map-style";

/** Draws a list of paths as SVG; clipped paths get their own clip path. */
export function DrawOps({ ops, id }: { ops: DrawOp[]; id: string }) {
  return <>{ops.map((op, i) => {
    if (op.text) return <text key={i} x={op.text.x} y={op.text.y} fill={op.fill} fontSize={op.text.size} fontWeight={600} textAnchor="middle" dominantBaseline="central" fontFamily="Inter, system-ui, sans-serif" style={{ userSelect: "none" }}>{op.text.value}</text>;
    const path = <path key={i} d={op.d} fill={op.fill ?? "none"} stroke={op.stroke ?? "none"} strokeWidth={op.width} opacity={op.opacity}
      strokeLinecap={op.cap ?? "round"} strokeLinejoin="round" clipPath={op.clip ? `url(#${id}-clip${i})` : undefined}
      transform={op.matrix ? `matrix(${op.matrix.join(" ")})` : undefined}/>;
    return op.clip ? <g key={i}><clipPath id={`${id}-clip${i}`}><path d={op.clip}/></clipPath>{path}</g> : path;
  })}</>;
}

/** The outside of the rooms, in the drawing's style. */
export function DrawingBackground({ drawing, width, height }: { drawing: Pick<MapDrawing, "background" | "style">; width: number; height: number }) {
  return <g pointerEvents="none"><DrawOps ops={backgroundOps(drawing, width, height)} id="creator-bg"/></g>;
}

export default function DrawingShape({ shape: s, drawing, prefix = "shape" }: { shape: MapShape; drawing: Pick<MapDrawing, "background" | "style">; prefix?: string }) {
  const opening = s.type === "door" || s.type === "window";
  return <g data-shape={s.id}>
    <DrawOps ops={shapeOps(s, drawing)} id={`${prefix}-${s.id}`}/>
    {s.type === "stamp" || s.type === "label" ? <path d={shapePath(s)} fill="transparent" stroke="none"/>
      : opening && <path d={shapePath(s)} fill="none" stroke="transparent" strokeWidth={Math.max(16, s.thickness)}/>}
  </g>;
}
