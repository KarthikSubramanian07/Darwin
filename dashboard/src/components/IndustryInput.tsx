// Screen 1: the landing / industry input. Focused, high-trust, editable.

import { useState } from "react";

const EXAMPLES = ["Legal services", "Customer support", "Finance", "Healthcare operations"];

interface IndustryInputProps {
  onStart: (industry: string) => void;
  onOpenLibrary: () => void;
  defaultIndustry?: string;
}

export function IndustryInput({
  onStart,
  onOpenLibrary,
  defaultIndustry = "Legal services",
}: IndustryInputProps): JSX.Element {
  const [industry, setIndustry] = useState(defaultIndustry);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const value = industry.trim();
    if (value) onStart(value);
  };

  return (
    <section className="landing">
      <div className="landing-inner">
        <h1 className="landing-title">Find the best LLM for every task in your business.</h1>
        <p className="landing-sub">
          Darwin benchmarks models against the actual work your company needs done, then creates
          an evidence-backed routing strategy.
        </p>

        <form className="industry-form" onSubmit={submit}>
          <label htmlFor="industry" className="visually-hidden">
            Industry
          </label>
          <input
            id="industry"
            className="industry-input"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Enter an industry, e.g. Legal services"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={!industry.trim()}>
            Build my model stack
          </button>
        </form>

        <div className="chips" role="group" aria-label="Example industries">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className={`chip ${industry === ex ? "chip-active" : ""}`}
              onClick={() => setIndustry(ex)}
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="landing-foot">
          <button className="link-btn" onClick={onOpenLibrary}>
            Open a previous run →
          </button>
        </div>
      </div>
    </section>
  );
}
