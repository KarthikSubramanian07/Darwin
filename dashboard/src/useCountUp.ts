import { useEffect, useRef, useState } from "react";

// Count a number up to `target` once, on mount. Respects prefers-reduced-motion.
export function useCountUp(target: number, ms = 900, decimals = 0): string {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setV(target);
      return;
    }
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v.toFixed(decimals);
}
