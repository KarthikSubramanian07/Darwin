// Circular "evolution" mark: a ring with a node orbiting it (each orbit = a generation).
// Quiet, modern, animated. Scales via the `size` prop.

export function Logo({ size = 26 }: { size?: number }) {
  const r = 9;
  const c = 14;
  return (
    <span className="logo" style={{ width: size, height: size }}>
      <svg viewBox="0 0 28 28" width={size} height={size} fill="none" aria-hidden>
        <circle cx={c} cy={c} r={r} stroke="var(--border-strong)" strokeWidth="1.5" />
        <circle cx={c} cy={c} r="3.1" fill="var(--accent)" />
        <g className="logo-orbit" style={{ transformOrigin: "14px 14px" }}>
          <circle cx={c} cy={c - r} r="2.2" fill="var(--fg)" />
        </g>
      </svg>
    </span>
  );
}
