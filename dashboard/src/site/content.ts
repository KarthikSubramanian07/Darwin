// Single source of truth for everything agents and crawlers read on trydarwin.pages.dev:
// the static homepage copy (served in raw HTML before React boots), the trust pages
// (/about, /contact, /privacy, /developers), their Markdown twins, llms.txt, and the sitemap.
// The Vite plugin in ./vitePlugin.ts renders all of it at build time. Keep copy honest:
// nothing here may claim a hosted API, a team, or an address that does not exist.

export const SITE_URL = "https://trydarwin.pages.dev";
export const REPO_URL = "https://github.com/KarthikSubramanian07/Darwin";
export const ISSUES_URL = `${REPO_URL}/issues`;
export const CLI_VERSION = "0.1.0";
export const RELEASE_WHEEL_URL = `${REPO_URL}/releases/download/v${CLI_VERSION}/trydarwin-${CLI_VERSION}-py3-none-any.whl`;
// Already published in SECURITY.md; the only contact address the project advertises.
export const CONTACT_EMAIL = "karthik.subramanian@berkeley.edu";

export const BRAND = "Darwin";
export const TAGLINE = "the evolutionary optimizer for AI agents";
export const SUMMARY =
  "Darwin is an open-source, MIT-licensed evolutionary optimizer for AI agents. Give it a task and it evolves the whole agent that solves it: the system prompt, the tool code the agent writes for itself, and the model it runs on. Every variant runs in an isolated sandbox, is scored by a grader it cannot modify, and is rolled back if it regresses.";

/** Inline text supports `[label](href)` links and `code` spans; nothing else. */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; lang: string; code: string };

export interface Section {
  heading: string;
  blocks: Block[];
  subsections?: Section[];
}

export interface Page {
  /** Clean URL path, e.g. "/about". The homepage is "/". */
  path: string;
  /** Output file stem: "about" emits about.html + about.md. */
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: Section[];
  /** Emitted as its own HTML page by the plugin (false for "/" and "/app", which are Vite entries). */
  standalone: boolean;
  /** Listed in sitemap.xml. */
  indexable: boolean;
  priority: number;
}

const p = (text: string): Block => ({ kind: "p", text });
const list = (...items: string[]): Block => ({ kind: "list", items });
const code = (lang: string, src: string): Block => ({ kind: "code", lang, code: src });

const WHEN_TO_USE: Section = {
  heading: "When to use Darwin",
  blocks: [
    p(
      "Reach for Darwin when the job is to find the best agent configuration for a specific, measurable task, not to answer a one-off question. Good fits:",
    ),
    list(
      "You have a task with a programmatic grader (unit tests, exact-match answers, an LLM judge you trust) and want the highest-scoring agent for it.",
      "You need to choose which LLM to route each kind of task to, based on scores on your own tasks rather than public leaderboards.",
      "You want an agent to improve its own prompt and tool code without that code ever running on the host machine.",
      "You need an auditable record of every variant, score, rollback, and model choice for a review or a demo.",
    ),
    p("Poor fits: tasks with no way to score an answer, real-time chat, or anything that needs a hosted API (Darwin is self-hosted)."),
  ],
};

const HOW_AGENTS_CALL: Section = {
  heading: "How an agent should use Darwin",
  blocks: [
    list(
      "Install the CLI (`brew install karthiksubramanian07/tap/trydarwin`) and run `darwin --offline` for a deterministic, key-free evolution run; read the fitness curve from stdout.",
      "Run `darwin-server` to start the local HTTP and WebSocket API on 127.0.0.1:8000, then `POST /api/run` with `{\"task\": \"coding_bench\", \"offline\": true}` and stream events from `WS /ws`.",
      "Poll `GET /api/status` to see whether a run is active. Run records are written as JSON under `~/.darwin/runs/` (or `data/runs/` in a clone; override with `DARWIN_DATA_DIR`).",
      "Add your own task as a JSON file under `~/.darwin/task/` (or `data/task/` in a clone) and pass its id with `--task`.",
    ),
  ],
};

export const HOME: Page = {
  path: "/",
  slug: "index",
  title: "Darwin: the evolutionary optimizer for AI agents · agents that breed better agents",
  description:
    "Darwin evolves the entire agent that solves your task: its prompt, its self-written tool code, and the model it runs on. Generation over generation, inside sandboxes it can't escape and against a grader it can't game.",
  h1: "Darwin: the evolutionary optimizer for AI agents",
  intro:
    "Point Darwin at a task. Its first attempt is deliberately mediocre. Then it breeds a population of variants, rewrites their tools, prompt, and even the model they run on, and keeps whatever scores higher. Nobody helps it. It never escapes the sandbox. It just gets better.",
  standalone: false,
  indexable: true,
  priority: 1.0,
  sections: [
    {
      heading: "What Darwin does",
      blocks: [
        p(SUMMARY),
        p(
          "Because the model is just one more gene, self-improvement and model selection are the same act. Point Darwin at one task and watch the score climb. Point it at a domain of related tasks and it hands back a routing card: the winning agent and model for each one.",
        ),
      ],
      subsections: [
        {
          heading: "How a generation works",
          blocks: [
            list(
              "Variation: Fireworks AI mutates each agent's prompt, tool code, parameters, and model.",
              "Selection: a Braintrust eval is the fitness function, and the score decides who survives.",
              "Inheritance: the fittest genomes seed the next generation; elitism keeps the best score monotonic.",
              "Containment: every variant runs in its own Daytona sandbox and is snapshot-rolled-back if it regresses.",
            ),
          ],
        },
      ],
    },
    {
      heading: "The safety spine",
      blocks: [
        list(
          "Sandboxed self-modification: genome code never runs in the host process.",
          "An immutable grader: the mutator is never handed the eval, and a test enforces it.",
          "Regression auto-rejection and rollback: a worse child is killed and its sandbox restored.",
          "Human veto and a hard compute cap: no new champion is promoted without sign-off.",
        ),
      ],
    },
    WHEN_TO_USE,
    {
      heading: "Explore",
      blocks: [
        list(
          "[The Lab](/app): benchmark models on your company's tasks and export a routing strategy.",
          "[Developers](/developers): quickstart, CLI, local API, and sandbox mode.",
          "[About](/about), [Contact](/contact), and [Privacy](/privacy).",
          `[Source code on GitHub](${REPO_URL}) under the MIT license.`,
          "[llms.txt](/llms.txt): a Markdown index of this site for AI agents.",
        ),
      ],
    },
  ],
};

export const LAB: Page = {
  path: "/app",
  slug: "app",
  title: "Darwin Lab · the best LLM for every task in your business",
  description:
    "Darwin Lab benchmarks models against the actual work your company needs done, races them task by task, scores them on real evidence, and hands back an evidence-backed routing strategy.",
  h1: "Darwin Lab: the best LLM for every task in your business",
  intro:
    "Generic benchmarks tell you which model wins their test. The Lab tells you which model wins your work. Describe an industry or a team, and Darwin decomposes it into concrete tasks, races a field of models on each one, and scores every attempt on evidence such as executed SQL, passing tests, or a judged rubric.",
  standalone: false,
  indexable: true,
  priority: 0.8,
  sections: [
    {
      heading: "What you get",
      blocks: [
        list(
          "A task-by-model race grid where every cell is a scored experiment.",
          "A 3D score landscape showing where each model is strong and where it falls off.",
          "A routing card: the recommended model for each task, with the evidence behind it.",
        ),
        p(
          "The public deployment plays a recorded race so it works without any backend. Run the engine locally (see [Developers](/developers)) to race models on your own tasks.",
        ),
      ],
    },
  ],
};

export const ABOUT: Page = {
  path: "/about",
  slug: "about",
  title: "About Darwin · open-source evolutionary agent optimizer",
  description:
    "Who builds Darwin, why it exists, and what it is: an open-source, MIT-licensed project that evolves AI agents safely inside sandboxes.",
  h1: "About Darwin",
  intro:
    "Darwin is an open-source research project by Karthik Subramanian. It started at the Daytona SF HackSprint with one question: what if the unit you optimize is not a prompt or a model, but the whole agent?",
  standalone: true,
  indexable: true,
  priority: 0.6,
  sections: [
    {
      heading: "Why Darwin exists",
      blocks: [
        p(
          "Most teams pick one model for everything and hand-tune one agent for weeks. Both are the wrong unit of work. The thing you actually want is the best whole agent for the task in front of you, and you want it to find itself. The reason almost nobody ships that is safety: an AI rewriting its own code is a liability no one signs off on. Darwin makes that safe by construction, with sandboxes, an immutable grader, automatic rollback, and a human veto.",
        ),
      ],
    },
    {
      heading: "What it is, and what it is not",
      blocks: [
        list(
          "It is a self-hosted Python engine plus a React dashboard, released under the MIT license.",
          "It is not a hosted service: there are no accounts, no API keys issued by Darwin, and no data sent to a Darwin server.",
          "It uses Daytona for sandboxes, Braintrust for evaluation, and Fireworks AI for fast mutation and the model catalog. Every one of those integrations can be switched off for a fully offline run.",
        ),
      ],
    },
    {
      heading: "Project facts",
      blocks: [
        list(
          `Source: [${REPO_URL.replace("https://", "")}](${REPO_URL})`,
          "License: MIT",
          "Language: Python 3.11+ engine, TypeScript and React dashboard",
          "Maintainer: Karthik Subramanian",
          "Based in: Berkeley, California, USA",
          "Contact: see [Contact](/contact)",
        ),
      ],
    },
  ],
};

export const CONTACT: Page = {
  path: "/contact",
  slug: "contact",
  title: "Contact · Darwin",
  description: "How to reach the Darwin maintainer: GitHub issues for bugs and ideas, email for security reports.",
  h1: "Contact Darwin",
  intro:
    "Darwin is maintained in the open, so most conversations happen on GitHub where everyone can see and search them. Pick the channel that matches what you need.",
  standalone: true,
  indexable: true,
  priority: 0.5,
  sections: [
    {
      heading: "Bugs, questions, and feature ideas",
      blocks: [
        p(
          `Open an issue at [${ISSUES_URL.replace("https://", "")}](${ISSUES_URL}). Include the command you ran, the task id, whether you ran with \`--offline\`, and the tail of the output. Pull requests are welcome; read CONTRIBUTING.md in the repository first.`,
        ),
      ],
    },
    {
      heading: "Security reports",
      blocks: [
        p(
          `Please do not open a public issue for anything security-sensitive. Email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) with a description, steps to reproduce, and the affected commit. Reports about sandbox escapes, grader isolation, secret leakage, or authentication bypass on the live server are the most valuable. You should get an acknowledgment within a few days.`,
        ),
      ],
    },
    {
      heading: "Everything else",
      blocks: [
        p(
          `For collaborations, talks, or press, email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) with "Darwin" in the subject line. Darwin is based in Berkeley, California, USA.`,
        ),
      ],
    },
  ],
};

export const PRIVACY: Page = {
  path: "/privacy",
  slug: "privacy",
  title: "Privacy · Darwin",
  description: "What trydarwin.pages.dev collects (almost nothing) and where your data goes when you run Darwin yourself.",
  h1: "Privacy policy",
  intro:
    "Short version: this website has no accounts, no cookies, no analytics, and no forms. When you run Darwin yourself, your data stays on your machine and goes only to the model and sandbox providers you configure.",
  standalone: true,
  indexable: true,
  priority: 0.3,
  sections: [
    {
      heading: "This website",
      blocks: [
        list(
          "trydarwin.pages.dev is a static site hosted on Cloudflare Pages. Cloudflare processes standard request data (such as IP address, user agent, and requested URL) to serve and protect the site, under Cloudflare's own privacy policy.",
          "Pages load the DM Sans and JetBrains Mono typefaces from Google Fonts, so your browser makes a request to Google when you visit.",
          "The demos on this site play recorded runs. Nothing you click is sent to a Darwin server, because there is none.",
          "We set no cookies and run no analytics or advertising scripts.",
        ),
      ],
    },
    {
      heading: "When you run Darwin",
      blocks: [
        p(
          "Darwin is self-hosted. Your tasks, genomes, and run records are written to your own disk. If you enable the optional integrations, prompts and code are sent to the providers you configure (Fireworks AI, Braintrust, Daytona) using your own API keys and under their terms. With `--offline`, nothing leaves your machine.",
        ),
      ],
    },
    {
      heading: "Changes and questions",
      blocks: [
        p(
          `Changes to this policy are tracked in the public repository history. Questions go to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
        ),
      ],
    },
  ],
};

export const DEVELOPERS: Page = {
  path: "/developers",
  slug: "developers",
  title: "Developers · Darwin quickstart, CLI, and local API",
  description:
    "Developer portal for Darwin: quickstart, the darwin CLI, the local HTTP and WebSocket API, configuration keys, and an offline sandbox mode.",
  h1: "Darwin for developers",
  intro:
    "Everything you need to run Darwin, script it, and plug it into your own agents. Darwin is self-hosted, so there is no signup: you bring your own provider keys, or none at all in offline mode.",
  standalone: true,
  indexable: true,
  priority: 0.9,
  sections: [
    {
      heading: "Quickstart",
      blocks: [
        code(
          "bash",
          [
            "# Homebrew (macOS, Linux)",
            "brew install karthiksubramanian07/tap/trydarwin",
            "",
            "# or pipx, straight from the GitHub release",
            `pipx install ${RELEASE_WHEEL_URL}`,
            "",
            "darwin --offline        # evolves an agent with no keys and no network",
          ].join("\n"),
        ),
        p(
          `Hacking on Darwin itself? Clone [the repository](${REPO_URL}) and run \`pip install -e ".[all]"\` instead. The \`[all]\` extra adds the optional Daytona, Braintrust, and autoevals SDKs; the base install runs fully offline without them.`,
        ),
        p(
          "The offline run uses a local sandbox, a local scorer, and canned mutations, so it is deterministic and free. The output ends with the fitness curve, the champion genome, and the path of the saved run record.",
        ),
      ],
    },
    {
      heading: "CLI",
      blocks: [
        p("The `trydarwin` package puts two commands on your PATH:"),
        list(
          "`darwin [--task ID] [--offline] [--echo]`: run one evolution. `--task` picks a task id: a built-in such as `coding_bench` (the default), `legal`, or `support`, or one of your own, `--offline` forces every integration off, `--echo` prints each event.",
          "`darwin-server`: start the live API on 127.0.0.1:8000 for the dashboard and for scripts.",
        ),
        p("Both are also available as modules: `python -m darwin.main` and `python -m darwin.server.app`."),
      ],
    },
    {
      heading: "Local API",
      blocks: [
        list(
          "`POST /api/run` with a JSON body `{\"task\": \"coding_bench\", \"offline\": true}` starts a run. Returns 409 if one is already active and 400 for an unknown task.",
          "`GET /api/status` returns `{\"running\": bool, \"task\": string | null, \"events\": number}`.",
          "`WS /ws` streams every evolution event (seed, eval, champion, mutation, rollback, blocked), replaying history first.",
        ),
        p(
          "The server binds to loopback. If you expose it, set `DARWIN_API_TOKEN` and send `Authorization: Bearer <token>` on `POST /api/run` and `WS /ws`.",
        ),
      ],
    },
    {
      heading: "API keys and configuration",
      blocks: [
        p(
          "Darwin does not issue API keys. Copy `.env.example` to `.env` and add keys only for the integrations you want, then flip their feature flags:",
        ),
        list(
          "`FEATURE_FIREWORKS=1` with `FIREWORKS_API_KEY` for LLM mutation and the model race.",
          "`FEATURE_BRAINTRUST=1` with `BRAINTRUST_API_KEY` to log every evaluation as an experiment.",
          "`FEATURE_DAYTONA=1` with `DAYTONA_API_KEY` to run variants in remote sandboxes with snapshot rollback.",
        ),
      ],
    },
    {
      heading: "Sandbox environment",
      blocks: [
        p(
          "Offline mode is the sandbox: it exercises the full loop with no keys, and CI runs the entire test suite this way. For a visual sandbox, the [homepage](/) replays a recorded evolution and [the Lab](/app) replays a recorded model race.",
        ),
      ],
    },
    WHEN_TO_USE,
    HOW_AGENTS_CALL,
  ],
};

export const NOT_FOUND: Page = {
  path: "/404",
  slug: "404",
  title: "Not found · Darwin",
  description: "This page does not exist on trydarwin.pages.dev.",
  h1: "404: nothing evolved here",
  intro:
    "The page you asked for does not exist. It may have been renamed, or the link may be wrong.",
  standalone: true,
  indexable: false,
  priority: 0,
  sections: [
    {
      heading: "Where to go instead",
      blocks: [
        list(
          "[Home](/): what Darwin is and how it works.",
          "[Developers](/developers): quickstart, CLI, and local API.",
          "[llms.txt](/llms.txt): a Markdown index of every page, for AI agents.",
          "[sitemap.xml](/sitemap.xml): every indexable URL.",
        ),
      ],
    },
  ],
};

export const PAGES: Page[] = [HOME, LAB, DEVELOPERS, ABOUT, CONTACT, PRIVACY, NOT_FOUND];

export const LLMS_EXTRA = { whenToUse: WHEN_TO_USE, howToCall: HOW_AGENTS_CALL };
