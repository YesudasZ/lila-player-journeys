import type { LayerKey, MarkerKind } from "../lib/drawList.ts";
import { HEAD_RADIUS, MARKER_SHAPES, shapePath } from "../lib/markerShapes.ts";

/** The colour of each thing that is drawn, as the class of its token. */
const TONES: Record<LayerKey, string> = {
  humans: "text-human",
  bots: "text-bot",
  kill: "text-kill",
  death: "text-death",
  storm_death: "text-storm",
  loot: "text-loot",
};

/** A journey as the map draws it: a solid line with a round head for a human, a dashed line with a square head for a bot. */
function JourneyShape({ bot }: { bot: boolean }) {
  return (
    <>
      <line x1="-13" x2="5" y1="0" y2="0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={bot ? "6 4" : undefined} />
      {bot ? (
        <rect x={8 - HEAD_RADIUS} y={-HEAD_RADIUS} width={HEAD_RADIUS * 2} height={HEAD_RADIUS * 2} className="fill-current stroke-bg" strokeWidth="3" paintOrder="stroke" />
      ) : (
        <circle cx="8" cy="0" r={HEAD_RADIUS} className="fill-current stroke-bg" strokeWidth="3" paintOrder="stroke" />
      )}
    </>
  );
}

/** A marker from the same shape the map's canvas draws, with the same dark outline. */
function MarkerShapeIcon({ kind }: { kind: MarkerKind }) {
  const shape = MARKER_SHAPES[kind];
  const d = shapePath(shape);
  if (shape.filled) return <path d={d} className="fill-current stroke-bg" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke" />;
  return (
    <>
      <path d={d} className="stroke-bg" strokeWidth="5.25" strokeLinecap="round" fill="none" />
      <path d={d} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" fill="none" />
    </>
  );
}

/** The sample of a legend row or of a journey in a list. */
export function Sample({ layer }: { layer: LayerKey }) {
  return (
    <svg viewBox="-14 -8 28 16" className={`h-4 w-7 shrink-0 ${TONES[layer]}`} aria-hidden="true">
      {layer === "humans" || layer === "bots" ? <JourneyShape bot={layer === "bots"} /> : <MarkerShapeIcon kind={layer} />}
    </svg>
  );
}
