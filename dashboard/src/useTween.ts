import { useEffect, useRef, useState } from "react";

// Ease a displayed number toward `target` whenever target changes (for the climbing metric +
// stat tiles during playback). Respects prefers-reduced-motion.
export function useTween(target: number, ms = 1600): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setV(target);
      return;
    }
    const start0 = performance.now();
    const a = from.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(a + (target - a) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}
