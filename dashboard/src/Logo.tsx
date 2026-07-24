// Circular mark: a ring with a node orbiting it (each orbit = a generation). Animated, quiet.

export function Logo({ size = 26 }: { size?: number }) {
  const r = 10;
  const c = 14;
  return (
    <span className="logo" style={{ width: size, height: size }}>
      <svg viewBox="0 0 28 28" width={size} height={size} fill="none" aria-hidden>
        <circle cx={c} cy={c} r={r} stroke="var(--fg-dim)" strokeWidth="1.6" />
        <circle cx={c} cy={c} r="3.6" fill="var(--accent)" />
        <g className="logo-orbit" style={{ transformOrigin: "14px 14px" }}>
          <circle cx={c} cy={c - r} r="2.1" fill="var(--fg)" />
        </g>
      </svg>
    </span>
  );
}
