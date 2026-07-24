// Darwin dashboard shell. LANE D owns this. Panels to build (see the build spec §7):
//   - FITNESS CURVE (the centerpiece: best-fitness per generation, climbing, big + legible)
//   - VARIANT LEADERBOARD (population ranked, reshuffling; rejected variants struck-through)
//   - GENOME DIFF VIEWER (what the agent rewrote in itself, with the mutator's lineage_note)
//   - GENERATION TIMELINE + SANDBOX MAP (Daytona sandboxes lighting up; rollback visualized)
//   - SAFEGUARDS STRIP (isolation on, grader locked, regressions rejected N, awaiting veto,
//                       CodeRabbit review status on the champion PR)
// Fed by darwin/server/events.py over the local WebSocket at /ws.

export default function App() {
  return (
    <main className="shell">
      <header>
        <span className="mark">🧬 Darwin</span>
        <span className="tag">an agent that evolves itself, safely</span>
      </header>
      <section className="placeholder">
        <p>Dashboard scaffold. Lane D builds the panels here.</p>
        <p className="hint">
          The fitness curve is the hero. Everything else is telemetry around it.
        </p>
      </section>
    </main>
  );
}
