import { useEffect, useRef, useState } from "react";
import { GENS } from "./run";

export type Phase = "idle" | "playing" | "done";

// Drives the replay: advances the generation on an interval, auto-plays once on mount, and can
// be re-run. This is what makes the number climb on screen.
export function useEvolution(stepMs = 1500) {
  const [gen, setGen] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef(0);

  function stop() {
    window.clearInterval(timer.current);
  }

  function run() {
    stop();
    setGen(0);
    setPhase("playing");
    timer.current = window.setInterval(() => {
      setGen((g) => {
        const next = Math.min(g + 1, GENS - 1);
        if (next >= GENS - 1) {
          stop();
          setPhase("done");
        }
        return next;
      });
    }, stepMs);
  }

  useEffect(() => {
    const t = window.setTimeout(run, 650);
    return () => {
      window.clearTimeout(t);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { gen, phase, run };
}
