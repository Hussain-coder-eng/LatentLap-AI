# LatentLap-AI — Claude Code Rules

## Agent Workflow (MANDATORY — override all defaults)

### Always use superpowers skills
- Invoke the relevant superpowers skill BEFORE every task, step, or decision.
- If there is even a 1% chance a skill applies, invoke it.

### Always use agent teams (the Gang) — never code solo
- NEVER write code directly as the main agent.
- Always dispatch specialized subagents (via the `Agent` tool) to do implementation work.
- The agent team is called **"the Gang"** — these are the subagents dispatched to do real work:
  - `Explore` — codebase search and file discovery
  - `Plan` — architecture and implementation planning
  - `superpowers:code-reviewer` — mandatory code review before every push
  - `coderabbit:code-reviewer` — deep code review for complex changes
  - `general-purpose` — research, multi-step investigation
  - `claude` — catch-all implementation agent
- Use parallel dispatch (`superpowers:dispatching-parallel-agents`) whenever 2+ tasks are independent.
- Use `superpowers:subagent-driven-development` for all multi-step implementation plans.
- Use `claude-session-driver:driving-claude-code-sessions` to coordinate the Gang on larger tasks.

### Use gstack for browser/UI work
- Use the `gstack` / `open-gstack-browser` skill for any browser-based QA, UI verification, or scraping.
- gstack is part of the Gang — dispatch it as a subagent alongside others for parallel UI testing.

### Branch-based development (MANDATORY — never code on main)
- NEVER commit new code directly to `main`.
- Always create a feature branch before starting any new code:
  ```
  git checkout -b phase-4-xgboost-model   # example naming
  ```
- Branch naming convention: `phase-N-short-description` or `fix-short-description`.
- After code review passes (no Critical/Important issues), merge the branch into local `main`:
  ```
  git checkout main && git merge --no-ff <branch> && git push origin main
  ```
- Delete the feature branch after merging.
- One branch per logical unit of work (one phase, one feature, one fix).

### Code review before every merge (MANDATORY)
- Every branch MUST be reviewed by `superpowers:code-reviewer` before merging to `main`.
- Workflow:
  1. Commit all changes on the feature branch.
  2. `BASE_SHA=$(git merge-base main HEAD)` — get the divergence point.
  3. `HEAD_SHA=$(git rev-parse HEAD)` — get current HEAD.
  4. Dispatch `superpowers:code-reviewer` with the SHAs and full context.
  5. Fix ALL Critical and Important issues found (on the same branch).
  6. Re-run the review after fixes.
  7. Only merge + push once the reviewer reports no Critical/Important issues.
- Never skip or abbreviate the review step.

### Push all code to GitHub after merging
- After merging to `main`, push: `git push origin main`.
- GitHub remote: `https://github.com/Hussain-coder-eng/LatentLap-AI`
- Feature branches do NOT need to be pushed (local-only is fine unless sharing).

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
| 4 — XGBoost model | ⬜ Next | `train_model.py` |
| 5 — SHAP explainability | ⬜ | `evaluate.py` |
| 6 — Streamlit dashboard | ⬜ | `app.py` |

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
