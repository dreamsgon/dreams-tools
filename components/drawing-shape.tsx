import { createContext, useContext } from "react";
import type { MapDrawing, MapShape } from "@/lib/model";
import { shapePath } from "@/lib/map-drawing";
import { shapeOps, groundOps, textFonts, type DrawOp } from "@/lib/map-style";
import { hexSiteOps } from "@/lib/hexmap/art";

/** Draws a list of paths as SVG; clipped paths get their own clip path. */
/** Where uploaded stamps' pictures are, by asset id. */
export const StampSources = createContext<ReadonlyMap<string, string>>(new Map());

export function DrawOps({ ops, id }: { ops: DrawOp[]; id: string }) {
  const sources = useContext(StampSources);
  return <>{ops.map((op, i) => {
    if (op.image) {
      const src = sources.get(op.image.assetId), transform = op.matrix ? `matrix(${op.matrix.join(" ")})` : undefined;
      return src ? <image key={i} href={src} width={op.image.w} height={op.image.h} preserveAspectRatio="none" transform={transform}/>
        : <rect key={i} width={op.image.w} height={op.image.h} fill="none" stroke="#8a939a" strokeDasharray="6 4" transform={transform}/>;
    }
    if (op.text) { const t = op.text;
      return <text key={i} x={t.x} y={t.y} fill={op.fill} fontSize={t.size} fontWeight={t.weight ?? 600} fontStyle={t.italic ? "italic" : undefined} textAnchor={t.align ?? "middle"} dominantBaseline="central" fontFamily={t.serif ? textFonts.serif : textFonts.sans}
        stroke={t.halo} strokeWidth={t.halo ? t.size * 0.28 : undefined} strokeLinejoin={t.halo ? "round" : undefined} paintOrder={t.halo ? "stroke" : undefined} style={{ userSelect: "none" }}>{t.value}</text>; }
    const path = <path key={i} d={op.d} fill={op.fill ?? "none"} stroke={op.stroke ?? "none"} strokeWidth={op.width} opacity={op.opacity}
      strokeLinecap={op.cap ?? "round"} strokeLinejoin="round" strokeDasharray={op.dash?.join(" ")} clipPath={op.clip ? `url(#${id}-clip${i})` : undefined}
      transform={op.matrix ? `matrix(${op.matrix.join(" ")})` : undefined}/>;
    return op.clip ? <g key={i}><clipPath id={`${id}-clip${i}`}><path d={op.clip}/></clipPath>{path}</g> : path;
  })}</>;
}

/**
 * The outside of the rooms, in the drawing's style, and the drawing's hex map if it has one.
 * `secrets` adds what only the GM sees, such as a hex map's ruins and lairs; leave it off for anything players get.
 */
export function DrawingBackground({ drawing, width, height, secrets }: { drawing: Pick<MapDrawing, "background" | "style"> & Partial<Pick<MapDrawing, "hexes">>; width: number; height: number; secrets?: boolean }) {
  return <g pointerEvents="none"><DrawOps ops={groundOps(drawing, width, height)} id="creator-bg"/>{secrets && drawing.hexes && <DrawOps ops={hexSiteOps(drawing.hexes)} id="creator-sites"/>}</g>;
}

export default function DrawingShape({ shape: s, drawing, prefix = "shape" }: { shape: MapShape; drawing: Pick<MapDrawing, "background" | "style">; prefix?: string }) {
  const opening = s.type === "door" || s.type === "window" || s.type === "opening";
  return <g data-shape={s.id}>
    <DrawOps ops={shapeOps(s, drawing)} id={`${prefix}-${s.id}`}/>
    {s.type === "stamp" || s.type === "label" ? <path d={shapePath(s)} fill="transparent" stroke="none"/>
      : opening && <path d={shapePath(s)} fill="none" stroke="transparent" strokeWidth={Math.max(16, s.thickness)}/>}
  </g>;
}
