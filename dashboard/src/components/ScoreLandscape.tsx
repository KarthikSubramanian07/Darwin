// The score landscape: task x model score as an extruded 3D skyline.
//
// Deliberately a STEPPED landscape, not a smooth interpolated surface. Both axes are nominal,
// and a run carries only ~16-25 measured cells; a smooth mesh would invent the overwhelming
// majority of its own geometry and its peaks would shift with row order. One column per real
// measurement, nothing between them.
//
// Encoding (see docs/LANE_D.md):
//   height  = score, anchored at 0 so column heights stay proportional to the value
//   colour  = EMPHASIS, not magnitude -- the row winner takes the accent, everything else
//             recedes to a neutral. Re-encoding score as a colour ramp would spend the only
//             free channel on what height already shows.
//   plane   = the best single model's mean score. Columns above it beat "just pick one model",
//             which is the entire product argument, readable at a glance.
//
// Palette validated against this app's dark surface (#14161c) with the dataviz validator:
// winner #2fae76 and failed #d03b3b pass lightness band, chroma floor, CVD separation
// (all-pairs deutan dE 9.6), normal-vision floor (31.3) and 3:1 contrast. The neutral is
// intentionally below the chroma floor -- it is the recessive "grey the rest", not an identity.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { PlaneGeometry, type Mesh } from "three";
import { buildLandscape, type LandscapeColumn } from "../lib/landscape";
import { singleModelBaseline } from "../lib/routing";
import { pct } from "../lib/format";
import type { ModelInfo, RaceResult, TaskInfo } from "../types";

const WINNER = "#2fae76";
const FAILED = "#d03b3b";
const NEUTRAL = "#5b6478";
const PENDING = "#2b3040";

// Columns stay thin relative to their spacing: with scores clustered in a narrow high band,
// wide columns fuse into one slab and the floor (the zero anchor) stops being visible at all.
const SPACING = 1.15; // centre-to-centre
const COL_W = 0.6;
const MAX_H = 2.1; // world height of score 1.0
// Axis labels sit on a ring this far beyond the grid. The camera below is placed so the whole
// ring stays inside the frustum at every azimuth -- otherwise the last label on an axis gets
// clipped by the canvas edge as the scene rotates.
const LABEL_RING = SPACING * 1.05;

const colourFor = (c: LandscapeColumn): string => {
  if (c.state === "failed") return FAILED;
  if (c.score === null) return PENDING;
  return c.winner ? WINNER : NEUTRAL;
};

/** Height for a column. Anchored at zero: a score of 0 is a floor tile, not a truncated bar. */
const heightFor = (c: LandscapeColumn): number => {
  if (c.state === "failed") return 0.12;
  if (c.score === null) return 0.04;
  return Math.max(0.04, c.score * MAX_H);
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function Column({
  column,
  x,
  z,
  selected,
  instant,
  onSelect,
  onHover,
}: {
  column: LandscapeColumn;
  x: number;
  z: number;
  selected: boolean;
  instant: boolean;
  onSelect: () => void;
  onHover: (c: LandscapeColumn | null) => void;
}): JSX.Element {
  const ref = useRef<Mesh>(null);
  const target = heightFor(column);
  const colour = colourFor(column);

  // Grow to the new height instead of snapping, so a score landing reads as an event.
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const current = mesh.scale.y;
    const next = instant ? target : current + (target - current) * Math.min(1, delta * 5);
    mesh.scale.y = next;
    mesh.position.y = next / 2;
  });

  return (
    <mesh
      ref={ref}
      position={[x, 0, z]}
      scale={[1, instant ? target : 0.04, 1]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(column);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <boxGeometry args={[COL_W, 1, COL_W]} />
      <meshStandardMaterial
        color={colour}
        emissive={colour}
        emissiveIntensity={column.winner ? 0.42 : 0.08}
        roughness={0.55}
        metalness={0.1}
        transparent={column.score === null}
        opacity={column.score === null ? 0.42 : 1}
        wireframe={selected}
      />
    </mesh>
  );
}

/**
 * Translucent reference plane at the best single model's mean score, with a bright edge so it
 * stays findable where it cuts through the columns. Anything poking above it beats the
 * "just pick one model" strategy.
 */
function BaselinePlane({ y, width, depth }: { y: number; width: number; depth: number }): JSX.Element {
  const w = width + SPACING * 0.4;
  const d = depth + SPACING * 0.4;
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#8ea0c0" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new PlaneGeometry(w, d).rotateX(-Math.PI / 2)]} />
        <lineBasicMaterial color="#9fb2d0" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

function Scene({
  columns,
  tasks,
  models,
  baselineY,
  selected,
  instant,
  onSelect,
  onHover,
}: {
  columns: LandscapeColumn[];
  tasks: TaskInfo[];
  models: ModelInfo[];
  baselineY: number | null;
  selected: string | null;
  instant: boolean;
  onSelect: (key: string) => void;
  onHover: (c: LandscapeColumn | null) => void;
}): JSX.Element {
  const nCols = Math.max(1, models.length);
  const nRows = Math.max(1, tasks.length);
  const xOf = (col: number): number => (col - (nCols - 1) / 2) * SPACING;
  const zOf = (row: number): number => (row - (nRows - 1) / 2) * SPACING;
  const width = nCols * SPACING;
  const depth = nRows * SPACING;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} />
      <directionalLight position={[-6, 5, -4]} intensity={0.35} />

      <gridHelper
        args={[Math.max(width, depth) + SPACING, Math.max(nCols, nRows) + 1, "#242a38", "#1b202b"]}
        position={[0, 0, 0]}
      />

      {baselineY !== null ? <BaselinePlane y={baselineY} width={width} depth={depth} /> : null}

      {columns.map((c) => (
        <Column
          key={c.key}
          column={c}
          x={xOf(c.col)}
          z={zOf(c.row)}
          selected={selected === c.key}
          instant={instant}
          onSelect={() => onSelect(c.key)}
          onHover={onHover}
        />
      ))}

      {/* Axis labels ride the DOM (drei Html) rather than 3D text: they inherit the app's
          typography and need no webfont fetch, which matters on venue Wi-Fi. No distanceFactor,
          so they hold a constant, legible screen size instead of scaling with perspective. */}
      {models.map((m, i) => (
        <Html key={m.id} position={[xOf(i), 0, zOf(nRows - 1) + LABEL_RING]} center>
          <span className="ls-axis-label">{m.label}</span>
        </Html>
      ))}
      {tasks.map((t, i) => (
        <Html key={t.id} position={[xOf(0) - LABEL_RING, 0, zOf(i)]} center>
          <span className="ls-axis-label">{t.name}</span>
        </Html>
      ))}

      {/* Direct-label the winners only. A number on every column would be noise, and every
          value is already one click away in the grid. */}
      {columns
        .filter((c) => c.winner && c.score !== null)
        .map((c) => (
          <Html
            key={`v-${c.key}`}
            position={[xOf(c.col), heightFor(c) + 0.26, zOf(c.row)]}
            center
          >
            <span className="ls-value-label tabular">{pct(c.score as number)}</span>
          </Html>
        ))}
    </>
  );
}

interface ScoreLandscapeProps {
  tasks: TaskInfo[];
  models: ModelInfo[];
  cells: Record<string, RaceResult>;
  results: RaceResult[];
  complete: boolean;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

export function ScoreLandscape({
  tasks,
  models,
  cells,
  results,
  complete,
  selected,
  onSelect,
}: ScoreLandscapeProps): JSX.Element {
  const [hovered, setHovered] = useState<LandscapeColumn | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const landscape = useMemo(
    () => buildLandscape(tasks, models, cells, complete),
    [tasks, models, cells, complete],
  );

  const baseline = useMemo(
    () => singleModelBaseline(results, models, tasks),
    [results, models, tasks],
  );
  const baselineY = baseline ? baseline.avgScore * MAX_H : null;

  const webgl = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      return Boolean(
        canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
      );
    } catch {
      return false;
    }
  }, []);

  // No WebGL: say so plainly and point at the grid, which carries every value already.
  if (!webgl) {
    return (
      <div className="ls-fallback" role="status">
        3D view unavailable in this browser. Every score is in the grid above.
      </div>
    );
  }

  return (
    <figure className="ls-figure">
      <figcaption className="ls-caption">
        <span className="ls-title">Score landscape</span>
        <span className="dim">
          Height is score, anchored at zero. {complete ? "Axes ordered by mean score." : "Race order."}
        </span>
      </figcaption>

      <div className="ls-canvas-wrap">
        <Canvas
          camera={{ position: [6.5, 7.2, 8.0], fov: 42 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <Scene
            columns={landscape.columns}
            tasks={landscape.tasks}
            models={landscape.models}
            baselineY={baselineY}
            selected={selected}
            instant={reducedMotion}
            onSelect={(key) => onSelect(selected === key ? null : key)}
            onHover={setHovered}
          />
          <OrbitControls
            enablePan={false}
            minPolarAngle={0.18}
            maxPolarAngle={Math.PI / 2.25}
            minDistance={7}
            maxDistance={20}
            autoRotate={!reducedMotion && !hovered}
            autoRotateSpeed={0.25}
          />
        </Canvas>

        {hovered ? (
          <div className="ls-tooltip" role="status">
            <strong>{hovered.taskName}</strong>
            <span className="dim"> × </span>
            <strong>{hovered.modelLabel}</strong>
            <div className="ls-tooltip-val">
              {hovered.score !== null ? (
                <>
                  <span className="tabular">{pct(hovered.score)}</span>
                  {hovered.winner ? <span className="ls-tag ls-tag-win">winner</span> : null}
                </>
              ) : hovered.state === "failed" ? (
                <span className="ls-tag ls-tag-fail">failed</span>
              ) : (
                <span className="dim">{hovered.state}</span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Identity is never colour-alone: every class is labelled here and in the grid. */}
      <div className="ls-legend">
        <span className="ls-key">
          <i className="ls-swatch" style={{ background: WINNER }} aria-hidden="true" />
          Task winner
        </span>
        <span className="ls-key">
          <i className="ls-swatch" style={{ background: NEUTRAL }} aria-hidden="true" />
          Other model
        </span>
        <span className="ls-key">
          <i className="ls-swatch" style={{ background: FAILED }} aria-hidden="true" />
          Failed
        </span>
        {baseline ? (
          <span className="ls-key">
            <i className="ls-swatch ls-swatch-plane" aria-hidden="true" />
            Best single model ({baseline.label}, {pct(baseline.avgScore)} avg)
          </span>
        ) : null}
      </div>
    </figure>
  );
}
