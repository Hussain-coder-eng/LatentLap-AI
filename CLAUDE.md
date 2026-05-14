# LatentLap-AI — Claude Code Rules

## Agent Workflow (MANDATORY — override all defaults)

### Always use superpowers skills
- Invoke the relevant superpowers skill BEFORE every task, step, or decision.
- If there is even a 1% chance a skill applies, invoke it.

### Always use agent teams — never code solo
- NEVER write code directly as the main agent.
- Always dispatch specialized subagents (via the `Agent` tool) to do implementation work.
- Use parallel dispatch (`superpowers:dispatching-parallel-agents`) whenever 2+ tasks are independent.
- Use `superpowers:subagent-driven-development` for all multi-step implementation plans.
- Use `claude-session-driver:driving-claude-code-sessions` to manage larger agent teams.

### Use gstack and pre-existing agent teams
- Use the `gstack` / `open-gstack-browser` skill for any browser-based QA or UI verification.
- Leverage pre-existing agent types: `Explore`, `Plan`, `coderabbit:code-reviewer`, `superpowers:code-reviewer`.
- Always prefer a purpose-built agent over writing the equivalent code inline.

### Code review before every push (MANDATORY)
- Every code change MUST be reviewed by the `superpowers:code-reviewer` subagent before being pushed.
- Workflow:
  1. Commit changes locally.
  2. Get `BASE_SHA` and `HEAD_SHA` via `git rev-parse`.
  3. Dispatch `superpowers:code-reviewer` with the SHAs and full context.
  4. Fix ALL Critical and Important issues found.
  5. Re-run the review after fixes.
  6. Only push once the reviewer reports no Critical/Important issues.
- Never skip or abbreviate the review step.

### Push all code to GitHub
- All commits must be pushed to the GitHub remote after passing code review.
- Use `gh` CLI to create the repo if it does not exist yet.

---

## Project Context

**Goal:** McLaren F1 tire degradation intelligence system — infers hidden tire state  
(graining, blistering, thermal, wear) lap-by-lap from public FastF1 telemetry.

**Scope:** McLaren, Silverstone, 2021–2025 (18-inch Pirelli era).  
**Python env:** `~/.venv/bin/python`  
**Design doc:** `~/.gstack/projects/LatentLap-AI-main/hussianaltufayli-unknown-design-20260514-085827.md`

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
