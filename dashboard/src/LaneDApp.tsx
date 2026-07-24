// Darwin dashboard root. Thin router over three views (landing / run / library) plus the top
// nav and demo-source control. All run state + event handling lives in useDarwinRun.

import { useState } from "react";
import { TopNav } from "./components/TopNav";
import { IndustryInput } from "./components/IndustryInput";
import { RunView } from "./components/RunView";
import { RunLibrary } from "./components/RunLibrary";
import { DemoControls } from "./components/DemoControls";
import { useDarwinRun } from "./store/useDarwinRun";
import type { RunDoc } from "./types";

type View = "landing" | "run" | "library";

export default function App(): JSX.Element {
  const { state, mode, activeIndustry, actions } = useDarwinRun();
  const [view, setView] = useState<View>("landing");
  const [demoOpen, setDemoOpen] = useState(false);

  const startRun = (industry: string): void => {
    actions.start(industry);
    setView("run");
  };

  const openRun = (doc: RunDoc): void => {
    actions.openRun(doc);
    setView("run");
  };

  const goHome = (): void => {
    actions.reset();
    setView("landing");
  };

  return (
    <div className="app">
      <TopNav
        mode={mode}
        onOpenLibrary={() => setView("library")}
        onOpenDemoControls={() => setDemoOpen((v) => !v)}
      />

        {demoOpen ? (
          <div className="demo-controls-anchor">
            <DemoControls
              mode={mode}
              onSelect={(m) => {
                actions.setMode(m);
                setDemoOpen(false);
              }}
              onClose={() => setDemoOpen(false)}
            />
          </div>
        ) : null}

        <main className="app-main">
          {view === "landing" ? (
            <IndustryInput onStart={startRun} onOpenLibrary={() => setView("library")} />
          ) : view === "library" ? (
            <RunLibrary onOpen={openRun} onClose={() => setView("landing")} />
          ) : (
            <RunView
              state={state}
              mode={mode}
              industry={activeIndustry}
              onStartAnother={goHome}
              onFallback={() => actions.fallbackToRecorded(activeIndustry || "Legal services")}
            />
          )}
        </main>

        <footer className="app-foot">
          <span className="dim">
            Darwin doesn't just pick a model. It evolves the whole agent, prompt, tools, and
            model, for each task, safely.
          </span>
        </footer>
    </div>
  );
}
