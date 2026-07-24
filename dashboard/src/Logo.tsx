// Minimal mark: a clean ring with a single accent core. No orbiting node, no frame.
// Matches the theme-adaptive favicon (public/favicon.svg).

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }}>
      <svg viewBox="0 0 28 28" width={size} height={size} fill="none" aria-hidden>
        <circle cx="14" cy="14" r="10" stroke="var(--fg-dim)" strokeWidth="1.6" />
        <circle cx="14" cy="14" r="3.8" fill="var(--accent)" />
      </svg>
    </span>
  );
}
