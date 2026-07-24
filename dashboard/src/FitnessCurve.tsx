// The hero curve. Renders the full line for all generations, then reveals it left-to-right with
// a clip-path that scales smoothly as `activeIndex` advances, so the climb draws in fluidly
// rather than jumping point to point. Dots fade in as the line passes them.

interface Props {
  values: number[]; // full curve, all generations
  activeIndex: number; // how many generations have played (0-based)
  height?: number;
}

export function FitnessCurve({ values, activeIndex, height = 200 }: Props) {
  const w = 600;
  const h = height;
  const padX = 10;
  const padY = 16;
  const n = values.length;
  const x = (i: number) => padX + (i * (w - padX * 2)) / Math.max(1, n - 1);
  const y = (v: number) => padY + (1 - v) * (h - padY * 2);

  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${h - padY} L ${x(0).toFixed(1)} ${h - padY} Z`;

  const progress = n > 1 ? activeIndex / (n - 1) : 1;

  return (
    <svg
      className="curve"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      role="img"
      aria-label="fitness curve climbing from 37.5% to 100%"
    >
      <defs>
        <linearGradient id="fillFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.20" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="revealClip">
          <rect
            x="0"
            y="0"
            width={w}
            height={h}
            style={{
              transformBox: "fill-box",
              transformOrigin: "left",
              transform: `scaleX(${progress})`,
              transition: "transform 1.7s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </clipPath>
      </defs>

      {[0, 0.5, 1].map((g) => (
        <line
          key={g}
          x1={padX}
          x2={w - padX}
          y1={y(g)}
          y2={y(g)}
          stroke="rgba(255,255,255,0.055)"
          strokeWidth="1"
        />
      ))}

      <g clipPath="url(#revealClip)">
        <path d={area} fill="url(#fillFade)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {values.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r={i === activeIndex ? 4.5 : 3}
          fill="var(--accent)"
          style={{
            opacity: i <= activeIndex ? 1 : 0,
            transition: "opacity 0.5s ease, r 0.3s ease",
            transitionDelay: i <= activeIndex ? `${i * 0.05}s` : "0s",
          }}
        />
      ))}
    </svg>
  );
}
