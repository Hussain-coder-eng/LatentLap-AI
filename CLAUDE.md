# LatentLap-AI — Claude Code Rules

## Agent Workflow (MANDATORY — override all defaults)

### Always use superpowers skills
- Invoke the relevant superpowers skill BEFORE every task, step, or decision.
- If there is even a 1% chance a skill applies, invoke it.

### Always use agent teams (the Gang) — never act solo
- NEVER write, edit, or modify any file directly as the main agent — all file changes
  must go through a dispatched subagent on a feature branch.
- Always dispatch specialized subagents (via the `Agent` tool) to do implementation work.
- The agent team is called **"the Gang"** — these are the subagents dispatched to do real work:
  - `Explore` — codebase search and file discovery (read-only)
  - `Plan` — architecture and implementation planning
  - `superpowers:code-reviewer` — mandatory code review before every merge (Agent subagent_type)
  - `coderabbit:code-reviewer` — deep code review for complex changes (Agent subagent_type)
  - `general-purpose` — read-only research and multi-step investigation
  - `claude` — write-path implementation (creating/editing files, running builds)
  - `gstack` — browser-based QA, UI verification, and scraping (invoke via `gstack` skill)
  - `frontend-developer` — specialist for React/Next.js/TypeScript frontend implementation (installed at `.claude/agents/development-team/frontend-developer`)
  - `ui-ux-designer` — specialist for UI/UX design decisions and component design (installed at `.claude/agents/development-team/ui-ux-designer`)
  - `ai-engineer` — specialist for ML/AI/data pipeline tasks (installed at `.claude/agents/data-ai/ai-engineer`)
  - `code-reviewer` (.claude template) — secondary code review option for quick checks (installed at `.claude/agents/development-tools/code-reviewer`). NOTE: the PRIMARY mandatory code reviewer remains `superpowers:code-reviewer`
  - `react-performance-optimization` — specialist for React/Next.js performance optimization (installed at `.claude/agents/performance-testing/react-performance-optimization`)
  - `nextjs-architecture-expert` — specialist for Next.js App Router architecture decisions (installed at `.claude/agents/web-tools/nextjs-architecture-expert`)
  - `mcp-expert` — specialist for MCP server setup and configuration (installed at `.claude/agents/development-tools/mcp-expert`)

**Agent selection rule:** When dispatching work, first check if an installed specialist agent matches the task domain. Specialists > generalists. Multiple specialist agents may collaborate on one task via parallel dispatch.

- Use parallel dispatch (`superpowers:dispatching-parallel-agents`) whenever 2+ tasks are independent.
- Use `superpowers:subagent-driven-development` for all multi-step implementation plans.
- Use `claude-session-driver:driving-claude-code-sessions` to coordinate the Gang on larger tasks.

**Communication style:** Use `caveman` skill (installed at `.agents/skills/caveman/`) for all responses — terse, no filler, technical accuracy maintained. Active by default; disable only with "stop caveman".

### Branch-based development (MANDATORY — never code on main)
- NEVER commit new code or file changes directly to `main`.
- Always create a feature branch before starting any new work:
  ```
  git checkout -b phase-4-xgboost-model   # example
  ```
- Branch naming convention: `phase-N-short-description`, `fix-short-description`, or `feat-short-description`.
- After code review passes (no Critical/Important issues), merge the branch into local `main`:
  ```
  git checkout main && git merge --no-ff <branch> && git push origin main && git branch -d <branch>
  ```
- Delete the feature branch after merging.
- One branch per logical unit of work (one phase, one feature, one fix).
- **Orphaned branches:** If a session ends before a branch is merged, the next session must
  re-run code review on that branch before merging — do NOT merge without a fresh review pass.

### Code review before every merge (MANDATORY)
- Every branch MUST pass `superpowers:code-reviewer` review before merging to `main`.
- The correct subagent type name is `superpowers:code-reviewer` (verified working in this project).
- Workflow:
  1. Commit all changes on the feature branch.
  1.5. Run the affected script with `--dry-run` (or equivalent) and confirm zero runtime errors.
  2. `BASE_SHA=$(git merge-base main HEAD)` — get the divergence point.
  3. `HEAD_SHA=$(git rev-parse HEAD)` — get current HEAD.
  4. Dispatch `superpowers:code-reviewer` subagent with the SHAs and full context.
  5. Fix ALL Critical and Important issues found (on the same branch), then re-review.
  6. Merge + push only once the reviewer reports no Critical/Important issues.
- Never skip or abbreviate the review step.

### Push all code to GitHub after merging
- GitHub remote: `https://github.com/Hussain-coder-eng/LatentLap-AI`
- Push is included in the merge command above (`git push origin main`).
- Feature branches are local-only unless explicitly sharing work.
- **Branch protection:** Enable "Require pull request reviews" on the GitHub `main` branch
  at Settings → Branches to enforce reviews at the remote level as well.

### Engineering best practices
- Functions do one thing; keep them short and testable.
- No magic numbers — define named constants at the top of each file.
- No silent failures — explicitly handle and log errors at system boundaries.
- Type hints on all function signatures.
- Validate inputs at script entry points; trust internal data within a pipeline stage.
- Keep data transformation and I/O separated — pure transform functions, thin I/O wrappers.
- Prefer explicit loops over `groupby.apply()` for multi-column assignments (pandas 2.x bug).
- Document every heuristic threshold with a comment explaining the empirical basis.

---

## Agent Orchestration Workflow (Claude + Codex MCP)

You are operating in a dual-agent architecture where **Claude Code is the Architect/Planner** and the **Codex MCP Tool is the Multi-Agent Builder Engine**. You must strictly adhere to the following workflow for all code modifications, features, and debugging tasks.

### 1. Role Boundaries & Execution Principles
* **Claude (Architect):** You own system design, high-level planning, file targeting, context management, and quality control. **Do not write the code blocks yourself.** You must delegate all execution to Codex via the MCP server interface.
* **Codex (Builder):** Codex owns file modification, terminal execution, tests, and active building.
* **Strict Parallelization Rule:** Never let Codex process tasks sequentially or bundle multiple sprint components into a single linear agent thread. You must enforce multi-agent concurrency.

### 2. Mandatory 4-Step Execution Loop
Every single user request must flow through this lifecycle:

#### Phase 1: Blueprinting (Claude)
* Break down the user's request into a strict architectural specification or technical tracking file (`.tasks.md`).
* Isolate every single distinct module, feature, or component required for the sprint.

#### Phase 2: Hyper-Parallel Delegation (Claude -> Codex)
* Invoke Codex by creating a dedicated agent for **every single isolated component** identified in Phase 1 (1 Agent = 1 Component).
* You must explicitly command **each** of these component agents to immediately spawn its own internal pool of parallel subagents (`worker`, `explorer`, `default`) to handle implementation tasks concurrently.
* *Example Directive:* `"Codex, spawn a separate agent for Component A, Component B, and Component C. Force every component agent to deploy parallel subagents internally to execute files concurrently. Maximize thread limits."`

#### Phase 3: Adversarial Review (The Quality Gate)
* Once Codex reports that all component agents and their subagents have finished implementing the files, you must trigger a strict adversarial review loop.
* Instruct Codex: `"Codex, deploy an adversarial review agent to audit all newly modified code. Explicitly scan for race conditions from parallel execution, boundary exceptions, and logic flaws."`

#### Phase 4: Error Mitigation Loop
* **If Errors/Bugs are found:** Take the raw output from the adversarial review, isolate each bug, and pass it back to Codex.
* Command Codex to spin up an agent per bug/error, with each agent deploying its own internal subagents to execute the fixes concurrently.
* **The Loop Condition:** Repeat Phase 3 and Phase 4 indefinitely. The task is **NOT** allowed to complete, and you may not present the final solution to the user, until the adversarial review returns **zero errors** and all unit tests pass perfectly.

---

## Project Context

**Goal:** McLaren F1 tire degradation intelligence system — infers hidden tire state
(graining, blistering, thermal, wear) lap-by-lap from public FastF1 telemetry.

**Scope:** McLaren, Silverstone, 2021–2025 (18-inch Pirelli era).
**Python env:** `~/.venv/bin/python`
**Design doc:** `~/.gstack/projects/LatentLap-AI-main/hussianaltufayli-unknown-design-20260514-085827.md`
**GitHub:** `https://github.com/Hussain-coder-eng/LatentLap-AI`

### Phase Status
| Phase | Status | Script |
|---|---|---|
| 1 — Data ingestion | ✅ Done | `explore_data.py` |
| 2 — Feature engineering | ✅ Done | `build_feature_table.py` |
| 3 — Weak supervision labels | ✅ Done | `build_labels.py` |
| 4 — XGBoost model | ✅ Done | `train_model.py` |
| 5 — SHAP explainability | ✅ Done | `evaluate.py` |
| 6 — Dashboard | ⬜ Next | `app.py` |
| 7 — Strategy Advisor | ✅ Done | `strategy.py` |

### Key Technical Rules (from HANDOFF.md)
- No exact tire wear percentages or temperatures — proxies only.
- No deep learning for v1 — XGBoost only.
- All outputs probabilistic (DegSeverity 0–3 scale).
- Label methodology must be documented — heuristic, not physical ground truth.
- Scope: McLaren + Silverstone only.
- Use `np.trapezoid` (not `np.trapz` — removed in NumPy 2.0).
- Use `pick_teams()` / `pick_drivers()` (not deprecated `pick_team()` / `pick_driver()`).
- FastF1 cache lives in `cache/` — do not delete.
- Data lives in `data/` — do not commit to git (in .gitignore).
