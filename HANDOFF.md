# LatentLap-AI — Agent Handoff Document

Generated: 2026-05-14 | Last updated: 2026-05-17 (ALL PHASES COMPLETE — 17/17 dashboard stories pass, merged to main)
Project root: `/Users/hussianaltufayli/Downloads/LatentLap-AI-main`
Python env: `~/.venv/bin/python`
GitHub: `https://github.com/Hussain-coder-eng/LatentLap-AI`

---

## Goal

Build a **McLaren F1 tire degradation intelligence system** as a portfolio piece targeting F1 data/engineering internship recruiters. The system infers hidden tire degradation states (graining, blistering, thermal, wear) lap-by-lap from public FastF1 telemetry — no proprietary data.

**Scope:** McLaren cars, Silverstone circuit, 2021–2025 (18-inch Pirelli era).
**Reference race:** 2022 British Grand Prix (documented blistering incident, well-validated).

The approved design doc is at:
`~/.gstack/projects/LatentLap-AI-main/hussianaltufayli-unknown-design-20260514-085827.md`

---

## Architecture (6 phases)

| Phase | Status | Script |
|---|---|---|
| 1 — Data ingestion | ✅ Done | `explore_data.py` |
| 2 — Feature engineering | ✅ Done (bugs fixed) | `build_feature_table.py` |
| 3 — Weak supervision labels | ✅ Done (bugs fixed) | `build_labels.py` |
| 4 — XGBoost model | ✅ Done (multi-year, pit features) | `train_model.py` |
| 5 — SHAP explainability + validation | ✅ Done | `evaluate.py` |
| 6 — Interactive web dashboard | ✅ **Done** (17/17 stories pass, merged to main, Vercel deployed) | `dashboard/` (Next.js 14 App Router) |
| 7 — Strategy Advisor | ✅ Done | `strategy.py` |

---

## Current State — ALL PHASES COMPLETE

All phases complete. Phase 6 (interactive Next.js dashboard) was redesigned from scratch — the original multi-panel WebGL layout was replaced with a cinematic, animejs-driven scrollable experience. All 17 user stories (US-001–US-017) pass. Merged to `main` on 2026-05-17 and pushed to GitHub (Vercel auto-deploys on push).

**Plans:**
- Phase 5 plan: `docs/superpowers/plans/2026-05-15-phase5-evaluate.md` (15 tasks)
- Phase 6 original plan: `docs/superpowers/plans/2026-05-15-phase6-dashboard.md` (superseded by redesign)
- **Phase 6 redesign plan (active):** `docs/superpowers/plans/2026-05-16-dashboard-redesign.md` (13 tasks)
- **Phase 6 redesign spec (active):** `docs/superpowers/specs/2026-05-16-dashboard-redesign-design.md`

**Gang + Codex MCP:** 7 specialist agents in CLAUDE.md. Codex MCP server: `/opt/homebrew/bin/codex mcp-server` at user scope. **Agent Orchestration Workflow** (Claude=Architect, Codex=Builder, adversarial review loop) now in CLAUDE.md.

**Communication:** `caveman` skill active by default.

**Data coverage (2026-05-16):** `data/labeled_table.csv` — **413 laps, 2021–2025 Silverstone**. 2 new features: `PitStopDuration` (seconds, OutLap only), `PrevCompoundCode` (-1 = first stint).

**Model performance (current):**
- Severity avg weighted-F1: **0.451** (driver LOO-CV; NOR/PIA/RIC folds)
- Mode avg weighted-F1: **0.686** (4-class: blistering=0, none=1, thermal=2, wear=3)
- Blistering detection: NOR 88%/92% prec/recall, PIA 78%/88%
- SLEI_BLISTER: **40.537** (p90 rolling-window SLEI, 2021–2025, excl. 40 artifact laps)
- evaluate.py gates: P1 SHAP ✅ P2 pit timing ✅ P3 Spearman 0.913 ✅ P4 OOS-2024 F1=0.525 ✅

**Mode classifier expanded:** `blistering` added (51 laps → enough signal). `mode_probs` shape now `(n, 4)`. Phase 6 plan updated to match.

**Phase 7 (Strategy Advisor — compute):** `strategy.py` — polynomial degradation curve fit, pit window extrapolation, JSON output. 34 tests pass. `outputs/strategy_recommendations.json` generated for all 10 driver-year combos. **StrategyAdvisor.tsx (Phase 6 dashboard panel) is not yet built** — that is the next step.

---

## Phase 4 — Completed

### What was built

`train_model.py` trains two XGBoost classifiers from 84 raw telemetry features (no label-leaking columns):

1. **Severity classifier** — `DegSeverity` (0–3), 81 training rows
2. **Mode classifier** — `FailureMode` (none / thermal / wear), 75 training rows
   - graining (1 row), blistering (5 rows), unreliable (1 row) excluded as too sparse

**Cross-validation:** Driver leave-one-out (train NOR → test RIC, train RIC → test NOR). Leave-one-year-out CV was planned but only 2022 data is available; revisit when 2021/2023–2025 data is ingested.

**CV results (2022 Silverstone, single-year):**
- Severity avg weighted-F1: 0.162 — NOTE: below majority-class baseline. Model learns from raw telemetry only (LapDelta, RollingDelta3, DegRateAccel excluded). SHAP analysis in Phase 5 should focus on directional patterns rather than individual-lap attribution.
- Mode avg weighted-F1: 0.445

**Feature exclusions (84 features kept from labeled_table.csv):**
- Excluded identifiers: DriverNumber, Year, Stint
- Excluded admin flags: TrackStatus, IsAccurate, OutLap, InLap
- Excluded raw times: LapTimeSec, S1Sec, S2Sec, S3Sec, FuelCorrLapTime
- Excluded severity label-generators: LapDelta, RollingDelta3, DegRateAccel, DeltaRate, S2Delta, S3_S1_Decay, S3_S1_DecayZ
- Excluded mode label-generators: ThermalAccumProxy, PushRecoveryDelta
- Excluded targets: DegSeverity, StintId

**Mode encoding (integer labels for XGBoost):**
```python
MODE_ENCODING = {"none": 0, "thermal": 1, "wear": 2}
```

### Outputs
```
train_model.py               ← Phase 4, DONE — trains + saves both classifiers
models/severity_model.ubj    ← DegSeverity classifier (gitignored, regenerate with train_model.py)
models/mode_model.ubj        ← FailureMode classifier (gitignored)
models/feature_list.json     ← 84 feature column names (shared input schema)
models/cv_results.json       ← per-fold metrics + mode_encoding dict
tests/test_train_model.py    ← 13 unit tests
```

### Public interface for Phase 5/6
```python
from train_model import load_severity_model, load_mode_model
sev_model, features = load_severity_model()   # XGBClassifier + list[str]
mode_model, features = load_mode_model()      # XGBClassifier + list[str]
# Inference:
probs = sev_model.predict_proba(df[features].values)  # shape (n, 4)
mode_probs = mode_model.predict_proba(df[features].values)  # shape (n, 4), classes: blistering/none/thermal/wear (alphabetical)
```

Note: Models are not committed to git. Run `~/.venv/bin/python train_model.py` to regenerate.

---

## Phase 5 — Completed

### What was built

`evaluate.py` — SHAP explainability, 4 validation checks, HTML report, 4 JSON artifacts for Phase 6.

**Two modes:**
```bash
~/.venv/bin/python evaluate.py --ingest   # ingest 2021/2023/2024/2025 → regen labeled_table.csv
~/.venv/bin/python evaluate.py            # SHAP + validation → outputs/
```

**Output artifacts (in `outputs/`):**
```
outputs/
├── shap_report.html          # Self-contained HTML portfolio artifact
├── shap_data.json            # Per-lap SHAP values (class-averaged)
├── predictions.json          # Severity + mode probabilities per lap/year/driver
└── validation_report.json    # 4 validation check results
```

**Validation results (2022 Silverstone, single-year):**
- [P1] SHAP importance: FAIL — top feature is `FuelEstKg`, not `MB_PeakLatG`/`MB_TimeSec`. Expected with low-CV single-year model. Rerun after multi-year ingest.
- [P2] Pit timing hit rate: computed from 2022 data
- [P3] Spearman NOR 2022 anchor stint: computed
- [P4] OOS 2024: SKIPPED — no 2024 data yet

**Key implementation decisions:**
- SHAP via `booster.predict(dm, pred_contribs=True)` — `shap.TreeExplainer` broken on XGBoost 3.2.0 multiclass
- `validate_oos_2024` retrains on non-2024 rows (true holdout), not the production model
- NaN guards on `TyreLife`/`StintId` — map to `-1` if NaN
- Pit timing denominator excludes pits where no pre-pit lap has a valid prediction
- Feature list always loaded from `feature_list.json` (85 features), never hardcoded

**Review issues fixed before merge (adversarial code review):**
- `validate_oos_2024` was in-sample (production model trained on all years) → fixed with internal retrain
- `int(TyreLife)` crash on NaN → guarded with `pd.notna()`
- Pit timing denominator inflated by un-warnable pits → fixed
- Empty predictions early exit added
- `top_features[0]` IndexError guard added

### Outputs
```
evaluate.py                    ← Phase 5, DONE — SHAP + validation + HTML report
tests/test_evaluate.py         ← 6 unit tests (all pass)
outputs/shap_report.html       ← gitignored, regenerate with evaluate.py
outputs/shap_data.json         ← gitignored
outputs/predictions.json       ← gitignored
outputs/validation_report.json ← gitignored
```

### Public interface for Phase 6
```python
# Load JSON artifacts written by evaluate.py
import json
from pathlib import Path

predictions = json.loads(Path("outputs/predictions.json").read_text())
# predictions["meta"]: years, drivers, severity_classes, mode_classes, features
# predictions["laps"]: list of {key, year, driver, lap_number, stint_id, compound,
#                               tyre_life, lap_delta, severity_true, severity_pred,
#                               severity_probs, mode_true, mode_pred, mode_probs,
#                               track_progress}

shap_data = json.loads(Path("outputs/shap_data.json").read_text())
# shap_data["top_features"]["severity"]: [[feat_name, importance], ...]
# shap_data["shap_values"]["severity"][lap_key]: {feat_name: shap_val, ...}
```

### Public interface for Phase 6 (from Phase 7)
```python
import json
from pathlib import Path

strategy = json.loads(Path("outputs/strategy_recommendations.json").read_text())
# strategy[year_str][driver] = {
#   "current_lap": int,
#   "current_severity": float | None,
#   "pit_strategies": [
#       {
#           "pit_lap": int,               # one of [18, 20, 22, 24, 26]
#           "finish_severity": float,     # projected severity at lap 52
#           "recommendation": str,        # "optimal" | "acceptable" | "late" | "critical"
#           "pit_window_start": int,
#           "pit_window_end": int,
#       }, ...  # 5 entries
#   ],
#   "primary_pit_window": {"start": int, "end": int},
#   "confidence": str,   # "high" | "medium" | "low"
# }

# Regenerate:
# ~/.venv/bin/python strategy.py                # all years
# ~/.venv/bin/python strategy.py --year 2022 --driver NOR
# ~/.venv/bin/python strategy.py --current-lap 24   # mid-race simulation
# ~/.venv/bin/python strategy.py --dry-run
```

---

## Phase 6 — Dashboard Redesign (Plan Ready)

### Specs
- **Redesign spec (active):** `docs/superpowers/specs/2026-05-16-dashboard-redesign-design.md`
- Original spec (superseded): `docs/superpowers/specs/2026-05-14-phase6-dashboard-design.md`

### What changed from original Phase 6
The multi-panel 3D WebGL dashboard was built and deployed. It was **fully redesigned** because:
- Hard to understand for non-technical visitors
- No narrative flow between chapters
- WebGL Track3D adds load time with no explanatory value

### New design: anime.js-inspired cinematic experience
Central hero object = large F1 tire (SVG, ~50vmin), always centered. Data floats left and right as callouts, exactly like animejs.com. 5 chapters driven by GSAP ScrollTrigger (500vh, scrub, no snap).

### Tech stack (redesign)
```
Next.js 15 (App Router) → Vercel native (no static export)
animejs v4 → tire ring rotation, morphTo tread, particles, stagger callouts, createDrawable circuit
GSAP + ScrollTrigger → scroll-driven pin (500vh), chapter progress, scrub
SVG → all visuals (tire, Silverstone circuit, speedometer) — no WebGL
Tailwind CSS → layout
```

**New dependency:**
```bash
cd dashboard && npm install gsap
```

### Visual design decisions (redesign)
- **Color palette:** Dark OLED `#080808` + McLaren Papaya Orange `#FF8000`
- **Tire ring color:** Pirelli compound system — Soft `#E8002D`, Medium `#FFC906`, Hard `#FFFFFF`
- **Severity:** drives glow color, tread morph, particle count/speed (NOT ring color)
  - Sev 0: `#00E676` glow | Sev 1: `#FFD600` | Sev 2: `#FF6D00` | Sev 3: `#FF1744`
- **Typography:** Rajdhani (hero numbers), Fira Code (data labels), DM Sans (body)
- **Dual-audience:** plain English always visible; `[ + Technical ]` expander per chapter for ML/engineering detail

### Key gotchas for redesign implementation
- **Anime.js v4 API:** `animate(target, props)` not `anime({targets,...})`, `createTimeline()`, `stagger()`, `ease:` not `easing:`, no `easeXxx` prefix
- **GSAP ScrollTrigger:** `scrub: true`, not snap — free scroll throughout
- **No WebGL** — Track3D.tsx is deleted; all visuals are SVG + CSS
- **`'use client'`** on all components using browser APIs or animation libs
- **Compound color** read from `getLap().compound` (FastF1 string: `'SOFT'`/`'MEDIUM'`/`'HARD'`)
- **Circuit SVG:** `lib/circuitSvg.ts` projects Silverstone 3D waypoints to 2D (same data as deleted `trackPath.ts`; SVG x = (wx+4.5)×22, y = (wz+4.5)×22)
- **JSON data** in `public/data/` loaded via static import — unchanged from original build

---

## Phase 3 — Completed with fixes

### What was built

`build_labels.py` assigns heuristic weak-supervision labels to `data/feature_table.csv`:

- `StintId` — stint index per driver (0, 1, 2, …)
- `DegSeverity` — 0=nominal, 1=mild, 2=moderate, 3=severe, -1=unreliable
- `FailureMode` — graining | blistering | thermal | wear | none | unreliable

**Current label distribution (2022 Silverstone, 82 laps):**
```
DegSeverity:  -1×1, 0×17, 1×22, 2×24, 3×18
FailureMode:  none×43, wear×24, thermal×10, graining×2, blistering×2, unreliable×1
```

**Key validation:** NOR 2022 Medium stint blistering correctly detected at laps 25 and 30 (SLEI spikes 3.99 and 4.18) — matches the documented McLaren blistering incident at the 2022 British GP.

### Outputs
```
data/labeled_table.csv       (82 laps × 115 features+labels)
data/labeled_table.parquet
```

---

## What Happened This Session — TireHero Animation Improvements (2026-05-17)

Implemented US-014 through US-017 on `feat-dashboard-redesign`, then merged to `main` and pushed to GitHub.

### What was built

| Story | File | Change |
|---|---|---|
| US-014 | TireRings.tsx | `createTimeline` entrance — outer/middle/inner rings draw via `createDrawable`, staggered +300ms each. Spokes stagger `translateX`, ticks stagger `translateY` (clockwork). Rotations resume after `.then()`. |
| US-015 | TireTread.tsx | Replaced CSS `transition: d` with `animate(pathRef, { d: morphTo('#tread-ref-N'), ease: spring({stiffness:180,damping:16}) })`. Hidden `<defs>` paths already in DOM. |
| US-016 | TireParticles.tsx | Added stagger spring entrance (`spring({stiffness:280,damping:14})`) on mount/severity change. Added `composition:'blend'` on ejecting particles. 60-frame orbit loop kept (function-based `[cos(θ), cos(θ+2π)]` approach is a no-op — see below). |
| US-017 | TireHero.tsx | Spring counter (`spring({stiffness:300,damping:22})`), `createAnimatable` scroll rotation (eased lag), entrance timeline, glow crossfade with race-condition fix. |

### Execution approach: parallel frontend-developer subagents

Agent worktree isolation (`isolation: "worktree"`) creates branches from `main`, not the current feature branch. Workers that needed `feat-dashboard-redesign` files found empty directories. Re-dispatched without isolation, working directly on `feat-dashboard-redesign`.

### Code review findings (adversarial pass — all fixed before merge)

| ID | Issue | Fix |
|---|---|---|
| C1 | Glow crossfade race condition — severity change during 200ms fade leaves stale styles | `fadeOutRef`/`fadeInRef` pause in-flight anims; `latestGlowState` ref read inside async callback |
| I1 | `duration: 0` with spring ease kills the spring — duration 0 = snap to end in one tick | Remove `duration: 0`; let spring drive timing naturally |
| I2 | TireRings rotations ran under `reducedMotion` — violates WCAG 2.3.3 | Removed `startRotations()` call from the reducedMotion branch |
| I3 | `as unknown as string` cast on `spring()` — Spring is already a valid `EasingParam` | Removed cast |
| I4 | `'-=600'` on first timeline add is a no-op (no previous sibling) | Changed to `0` (absolute start) |

### Commits (all on `feat-dashboard-redesign`, merged via `0cdaeca`)

```
9bb6cd0  feat: [US-014] TireRings entrance timeline
d81b48f  feat: [US-015] TireTread spring morph
7d391d6  feat: [US-017] TireHero spring counter + createAnimatable + entrance + glow crossfade
50133e5  feat: [US-016] TireParticles stagger spring entrance + blend ejection
a116900  fix: replace deprecated createSpring with spring()
84c318e  fix: code review C1+I1+I2+I3+I4
8317a00  chore: mark US-015, US-016, US-017 passes=true, append progress
```

---

## What Happened This Session — Dashboard Redesign Execution Start (2026-05-16/17)

### Execution approach: Ralph autonomous loop

Codex MCP was the intended builder but caused multi-hour stalls (tool approval prompts + network timeouts). Switched to Ralph loop: `scripts/ralph/ralph.sh --tool claude 20` — runs `claude --dangerously-skip-permissions --print < CLAUDE.md` iteratively, one story per context window.

### PRD created: `scripts/ralph/prd.json`

13 user stories (US-001–US-013), ordered by dependency. Each story has verifiable acceptance criteria derived from the plan. Ralph reads this file, picks highest-priority `passes: false` story, implements it, commits, sets `passes: true`.

### Stories completed this session

| Story | Commit | Key learnings |
|---|---|---|
| US-001 | `83f541a` | gsap installed, circuitSvg.ts created, CSS vars added, isTechnicalMode in RaceContext |
| US-002 | `06af83d` | TireRings: `rotate: 360` (number, not string), `style={{ transformOrigin: '200px 200px' }}`, counter-CW = `-360` |
| US-003 | `fa82418` | TireTread: `morphTo(pathString)` returns FunctionValue valid as AnimationParams value; all paths need identical command count |

### Rate limit behavior

Ralph's `claude` subprocess hits Claude usage limits. After ~3 stories, output becomes `"You've hit your limit · resets HH:MMpm"`. Re-run the loop after the reset time — PRD state is preserved, loop resumes from next `passes: false` story.

### Files created this session

```
scripts/ralph/                 ← NEW — Ralph autonomous loop
├── ralph.sh                   ← Loop runner (--tool claude 20)
├── CLAUDE.md                  ← Per-iteration prompt for ralph claude subprocess
├── prd.json                   ← 13-story PRD (source of truth for progress)
└── progress.txt               ← Per-iteration learnings log

dashboard/
├── lib/circuitSvg.ts          ← NEW — Silverstone 2D waypoints + buildCircuitPath()
├── app/RaceContext.tsx        ← MODIFIED — added isTechnicalMode state
├── styles/globals.css         ← MODIFIED — added compound/severity CSS vars + keyframes
├── app/components/
│   ├── TireRings.tsx          ← NEW — 3 concentric SVG rings, independent anime.js rotation
│   └── TireTread.tsx          ← NEW — morphing SVG tread, animejs morphTo on severity change
```

---

## What Happened This Session — Dashboard Redesign Brainstorm + Plan (2026-05-16)

Complete redesign of the Phase 6 dashboard. Original multi-panel layout replaced with anime.js-inspired cinematic experience.

### Design decisions
| Decision | Detail |
|---|---|
| Hero object | Large F1 tire (SVG, ~50vmin) — not a top-down car. Three concurrent animation layers. |
| Animation reference | animejs.com homepage — central animated object, data text floats left/right |
| Navigation | Arrow nav + progress dots (option B). No scroll-snap — GSAP ScrollTrigger scrub |
| Chapters | 5: Hero, Severity+Mode, Predictors, Race Arc, Pit Strategy |
| Audience | Dual: plain English always visible; `[ + Technical ]` expander per chapter |
| Tire ring color | **Pirelli compound system** — Soft=#E8002D, Medium=#FFC906, Hard=#FFFFFF |
| Severity colors | Glow + particles only (NOT rings): sev0=#00E676, sev1=#FFD600, sev2=#FF6D00, sev3=#FF1744 |
| Scroll | Free scroll + GSAP ScrollTrigger `scrub:true`, 500vh pinned stage |
| Circuit | Silverstone SVG background, `createDrawable` draw-in, `createMotionPath` car |
| Speedometer | Fixed top-left, scroll velocity → needle, 0–300 km/h, decay via anime.js outExpo |
| No WebGL | Track3D.tsx deleted entirely — SVG-only for load speed and headless testability |

### Artifacts
- Spec: `docs/superpowers/specs/2026-05-16-dashboard-redesign-design.md` (committed)
- Plan: `docs/superpowers/plans/2026-05-16-dashboard-redesign.md` (13 tasks, ready to execute)

---

## What Happened This Session — Phase 7 Strategy Advisor (2026-05-16)

Designed, implemented, reviewed, and merged Phase 7 compute (`strategy.py` + `tests/test_strategy.py`).

### Execution approach: Concurrent agents (Claude Architect + Codex Builder)
Following the Agent Orchestration Workflow in CLAUDE.md:
- **Codex explorer** mapped target files (confirmed Python 3.9, predictions schema)
- **Worker A** (ai-engineer subagent) implemented `strategy.py` — all 8 functions
- **Worker B** (ai-engineer subagent) implemented `tests/test_strategy.py` — 34 tests
- Workers A and B ran **in parallel** (independent files, no conflicts)
- Adversarial code review (`superpowers:code-reviewer`) found 2 Critical + 1 Important issues; all fixed

### Build results

| Step | Result |
|---|---|
| Codex explorer | Python 3.9.23 confirmed, severity_pred is float, no strategy.py existed |
| Worker A: strategy.py | 8 functions, 150 lines, clean import verified |
| Worker B: tests/test_strategy.py | 34 tests, syntax verified |
| First test run | 30/30 pass |
| Dry-run on real data | 10 driver-year combos, no errors, valid JSON |
| Adversarial code review | 2 Critical + 1 Important found + fixed |
| Final test run | 34/34 pass (4 new regression tests from fixes) |
| Merged to main | Commit `00dfeda` |

### Design decisions

| Decision | Detail |
|---|---|
| Mathematical model | `finish_severity = baseline + (p(race_laps) - p(pit_lap + 1))` — earlier pit gives higher finish severity (more fresh-tire laps consumed by race end) |
| Pit window definition | Consecutive candidate laps [18,20,22,24,26] where finish_severity ≤ ideal_threshold (2.0) |
| Python 3.9 compat | `from __future__ import annotations` enables `int \| None` and `list[int]` syntax on Python 3.9 |
| Polynomial degree | Degree 2 — captures typical acceleration-phase degradation without overfitting sparse stint data |

### Phase 7 outputs
```
strategy.py                        ← Phase 7 compute script
tests/test_strategy.py             ← 34 tests (unit + integration)
outputs/strategy_recommendations.json  ← gitignored; regenerate with strategy.py
docs/superpowers/specs/2026-05-15-phase7-strategy-design.md  ← approved design spec
docs/superpowers/plans/2026-05-15-phase7-strategy.md         ← implementation plan
```

## What Happened This Session — Phase 5 Implementation (2026-05-15)

`evaluate.py` implemented, reviewed (adversarial code review), and merged to main.

| Step | Result |
|---|---|
| Codex built `evaluate.py` + `tests/test_evaluate.py` | 6/6 tests pass |
| Dry run on 2022 data | 4 artifacts in `outputs/` |
| Adversarial code review | 2 P1 + 4 P2 issues found |
| Codex fixed all issues | All 6 fixes verified |
| Merged to main | Commit `a8e0aaf` |

**Gotchas added to "What Didn't Work" table:**
- `validate_oos_2024` with production model → in-sample (not true OOS); always retrain inside the function on non-OOS rows
- `int(row["TyreLife"])` without NaN guard → `ValueError` on FastF1 rows with missing stint data

## What Happened This Session — Plan Writing (2026-05-15)

### Phase 5 plan (`docs/superpowers/plans/2026-05-15-phase5-evaluate.md`)

Written by Plan subagent. Key decisions captured:

| Decision | Detail |
|---|---|
| SHAP API | `shap.TreeExplainer` BROKEN on XGBoost 3.2.0 multiclass — use `booster.predict(dm, pred_contribs=True)` instead |
| Feature count | 85 not 84 — `Stint` present in `feature_list.json` despite exclusion list; load from file, never hardcode |
| Beeswarm charts | `shap.summary_plot` not used (requires broken TreeExplainer); render as Plotly jittered scatter instead |
| Spearman API | Use `result.statistic` not `result.correlation` (scipy 1.17.1 changed field name) |
| JSON size | class-averaged SHAP stored (not per-class) to keep `shap_data.json` < 10 MB |

### Phase 6 plan (`docs/superpowers/plans/2026-05-15-phase6-dashboard.md`)

Written by Plan subagent. Key decisions captured:

| Decision | Detail |
|---|---|
| Anime.js v4 API | All code uses `animate()`, `createTimeline()`, `stagger()`, `ease:` — never `anime({targets})`, `easing:`, or `easeXxx` prefix |
| WebGL testing | Never test `Track3D.tsx` with headless browser — `BindToCurrentSequence failed`; use real Chrome only |
| Static export | `output: 'export'` in next.config.js; all JSON loaded via static import (no fetch); must be in `public/data/` |
| `OrbitControls` | From `@react-three/drei` only — never `three/examples/jsm/controls/OrbitControls` |
| `'use client'` | Required on all R3F components and any component using browser APIs |
| prefers-reduced-motion | `useReducedMotion` hook called in every component; gates all `animate()` calls |

### Gang expansion
7 specialist agents added to CLAUDE.md (commit `6da54f2`). Agent selection rule: specialists before generalists.

### Gotchas added to "What Didn't Work" table

---

## What Happened This Session — Bug Fixes

Two fix branches were created, reviewed, and merged.

### Branch: `fix-data-pipeline-bugs` (merged `5b960b6`)

Found by code review and domain audit. Fixed in `build_feature_table.py` and `build_labels.py`.

| ID | File | Bug | Fix |
|---|---|---|---|
| C-1 | `build_feature_table.py` | `np.trapezoid(y, dt_sec)` — `dt_sec` passed as x-axis gives `diff(dt_sec) ≈ 0`, producing near-zero SLEI integrals | Use `np.trapezoid(y, np.cumsum(dt_sec))` throughout |
| C-2 | `build_feature_table.py` | `PostSC_Lap` detection ran on already-filtered laps — SC-status rows already removed before flag was set | Move SC flag computation to before the lap filter, then map flags onto filtered df |
| I-1 | `build_labels.py` | Pre-pit severity boost used `InLap == 1` to skip final stint — but FastF1 always sets `InLap=0` because pit-in laps fail `IsAccurate` | Detect final stint via `stint == max(StintId)` per driver/year instead |
| I-A | `build_labels.py` | `SLEI_BLISTER` comment said "calibrated on corrected integration" — false, it was calibrated on the buggy code | Replaced with `⚠ STALE` warning |
| I-B | `build_labels.py` | Validation report NOR filter had no Year predicate; severity pivot grouped without Year | Added `Year` to both |

### Branch: `fix-label-quality` (merged `13bdabe`)

Found by F1 domain agent auditing the label values. Two rounds of fixes.

**Root cause:** RIC Lap 3 (LapTimeSec=128.8s, `LapDelta=33.0s`) passed the `MAX_LAP_SEC=130` filter but was a SC/incident lap. It contaminated three features used by the graining label.

| ID | File | Bug | Fix |
|---|---|---|---|
| A | `build_feature_table.py` | `EarlyStintConcavity` polyfit included outlier Lap 3 — inflated coefficient 9× (0.325 → 2.923) | Add `& (LapDelta <= OUTLIER_DELTA_CAP)` to `_early` filter |
| B | `build_feature_table.py` | `LapVariance` rolling std on raw `LapTimeSec` — Lap 3 stayed in window for laps 4–7, producing variances 14–22s | Switch to loop with masked `FuelCorrLapTime` (outlier laps → NaN before rolling) |
| 5A | `build_feature_table.py` | `RollingDelta3` had same contamination — Lap 3 elevated laps 5–6 rolling mean to 11.8s | Same masking pattern applied |
| C | `build_labels.py` | Graining condition had no pace-loss guard — laps 5–7 with `LapDelta < 0.20` labeled graining; Lap 7 was `DegSeverity=0 + FailureMode=graining` (internal contradiction) | Add `LapDelta > DELTA_GRADE0` as fourth graining condition |
| Q3 | `build_labels.py` | Pre-pit `+1` boost could push `DegSeverity=3` when `LapDelta < DELTA_WEAR=0.60` — resulting in `Sev=3 / FailureMode=none` (incoherent) | Fallback rule: `Sev≥3 + none + LapDelta > DELTA_GRADE0` → `wear` |
| STALE | `build_labels.py` | `ROLLING_GRADE2_THRESH`, `CONCAVITY_GRAIN`, `LAPVAR_GRAIN` had no stale warnings despite depending on pre-fix feature values | Added `⚠ STALE` comments to all three, matching existing `SLEI_BLISTER` pattern |

---

## What Didn't Work (don't repeat these)

Carries forward from prior session, plus new entries:

| Mistake | Why it failed | Fix |
|---|---|---|
| `pick_team()`/`pick_driver()` | Deprecated in FastF1 v3.x | Use `pick_teams()`/`pick_drivers()` |
| 130s lap time guard omitted | SC restart lap (139.6s) passed `IsAccurate`, contaminating data | Always filter `LapTimeSec < 130` |
| `lap.get_telemetry()` on modified DataFrame rows | FastF1 metadata lost after pandas copy/transform | Pass original `session.laps.pick_teams(TEAM)` object, not modified df |
| `groupby(...).apply(fn_returning_Series)` for scalar-per-group | Pandas 2.x interprets result as multi-column DataFrame | Use explicit `for key, grp in df.groupby(...)` loop + dict |
| `np.trapz` | Removed in NumPy 2.0 | Use `np.trapezoid` |
| `np.trapezoid(y, dt_sec)` with per-sample durations as x-axis | `diff(dt_sec) ≈ 0` → near-zero integrals | Pass `np.cumsum(dt_sec)` as x-axis |
| `PostSC_Lap` detection on filtered laps | SC rows already removed before flag computed → always 0 | Run on unfiltered laps, then map onto filtered df |
| Using `InLap == 1` to detect pit-in laps | FastF1 marks pit-in laps `IsAccurate=False` and filters them out — `InLap` is always 0 in the clean table | Detect final stint via `max(StintId)` per driver/year |
| Including outlier laps in `EarlyStintConcavity` polyfit | A single 128.8s SC lap inflated the quadratic coefficient 9× | Filter `LapDelta <= OUTLIER_DELTA_CAP` before polyfit |
| `LapVariance` on raw `LapTimeSec` with unmasked rolling window | SC outlier laps in window inflate std for 4 subsequent laps | Use masked `FuelCorrLapTime` loop; outlier laps → NaN before rolling |
| Graining condition without pace-loss guard | `EarlyStintConcavity` and `LapVariance` contamination caused grade-0 laps to get graining labels | Require `LapDelta > DELTA_GRADE0` as guard condition |
| Pre-pit boost without wear fallback | Boost drives `Sev=3` on laps below `DELTA_WEAR` → `Sev=3 / FailureMode=none` contradiction | Add fallback: `Sev≥3 + none + LapDelta > DELTA_GRADE0` → wear |
| dataprep EDA (library) | MarkupSafe/Jinja2/Bokeh/IPython/NumPy version chain incompatible with Python 3.12+ | Use manual pandas/numpy EDA instead |
| Groupby LOO CV | GroupShuffleSplit on Year planned but only 1 year available → used driver-LOO instead | Use LOY-CV when 2021/2023–2025 data is ingested |
| eval_set=test_fold early stopping | Optimistic avg_best_iteration; acceptable with ~41 train rows; Phase 5 SHAP should note | Document in HANDOFF |
| Three.js WebGL in headless Chromium browse | `BindToCurrentSequence failed` — sandboxed SwiftShader can't create WebGL context | Use SVG + CSS 3D prototype for browser testing; test Three.js in real browser only |
| Anime.js v3 vs v4 API mismatch | Spec initially written with v3 `anime({targets})` syntax; v4 uses `animate(target, props)`, `createTimeline()`, `ease:` not `easing:`, no `easeXxx` prefix | Always check v4 docs — see `.agents/skills/animejs/SKILL.md` |
| Replacing Framer Motion with Anime.js | First spec amendment removed framer-motion entirely; user then installed framer-motion explicitly | Use both: Anime.js for path/SVG/sequence animations, framer-motion for React component animations |
| Subagent running out of context | Long spec-amendment subagent hit context limit before completing | Break spec amendments into smaller targeted subagent tasks (1 file per dispatch) |
| `shap.TreeExplainer` on XGBoost 3.2.0 multiclass | `base_score` serialized as string array → `ValueError: could not convert string to float` | Use `model.get_booster().predict(dm, pred_contribs=True)` — native XGBoost SHAP path |
| Planning subagent returning file content as text | Plan subagent wrote plan as assistant message instead of saving to file | Parent agent must save the returned text using Write tool |
| `validate_oos_2024` using production model | Production `sev_model` trained on all years including OOS year → in-sample evaluation, not true holdout | Retrain a fresh model inside `validate_oos_2024` on `df[Year != OOS_YEAR]` rows |
| `int(row["TyreLife"])` without NaN guard | FastF1 can produce NaN TyreLife on in-laps or SC laps; `int(float('nan'))` raises `ValueError` with no useful context | Wrap with `int(v) if pd.notna(v) else -1` at all integer conversions from DataFrame rows |
| Test assertion direction reversed for `extrapolate_finish_severity` | Plan had `sev_late >= sev_early` but model gives "earlier pit = higher finish severity" (more fresh-tire laps = more wear at race end) | Fixed assertion to `sev_early >= sev_late`; updated docstring |
| `compute_pit_window` returning non-consecutive windows | Original `qualifying[0]` / `qualifying[-1]` logic endorsed intermediate non-qualifying laps (e.g. pit 18 and 22 qualify but 20 doesn't → window reported as 18–22) | Replaced with longest-consecutive-run scan; dead `acceptable_threshold` param removed |
| NaN `severity_pred` propagating silently through polyfit | NaN in any lap's severity_pred passed through `np.polyfit` → `np.poly1d` → `np.clip` without error; output JSON contained NaN literals (invalid strict JSON) | Added NaN guard in `generate_strategy_json`; contaminated records skipped with WARNING print |
| Missing schema validation on predictions.json | Bare `KeyError: 'laps'` with no path or record context if predictions.json had schema drift | Added `_validate_predictions_payload(raw, source)` that checks `laps` key and all required per-record fields with named error messages |
| `int \| None` syntax on Python 3.9 | PEP 604 union syntax requires Python 3.10+; project runs Python 3.9.23 | Add `from __future__ import annotations` at top of any file using modern union syntax |
| Codex MCP tool stalls | `mcp__codex__codex` calls blocked on tool-approval prompts; when approval was skipped by user, subsequent calls caused multi-hour silent hangs | Use Ralph loop (`scripts/ralph/ralph.sh --tool claude`) or Agent tool (subagent_type=claude) instead |
| Ralph loop hits Claude rate limits | After ~3 iterations the `claude` subprocess returns `"You've hit your limit · resets HH:MMpm"` — loop keeps cycling but does nothing | Wait for reset time (shown in output), then re-run `./scripts/ralph/ralph.sh --tool claude 20`; PRD state is preserved |
| animejs rotate string vs number | `rotate: '360deg'` caused type errors in v4 — `rotate` expects a number | Use `rotate: 360` (number). Counter-clockwise: `rotate: -360` |
| morphTo path command count mismatch | morphTo silently produces broken animation if paths have different command counts | All TREAD_PATHS must have identical structure: M + 11L + Z (13 commands each) |
| Next.js version assumption | Plan spec says "Next.js 15" but `dashboard/package.json` shows `14.2.35` — App Router works identically | Trust `package.json`, not plan spec — no behavioral difference for this project |
| `createSpring()` deprecated in animejs 4.4.1 | `createSpring()` emits `console.warn('createSpring() is deprecated use spring() instead')` — violates "no console errors" acceptance criterion | Use `spring({stiffness, damping})` — same parameters, no warning. Both exported from `'animejs'`. |
| `spring()` with `duration: 0` | Explicitly providing `duration: 0` causes the tween to snap to end value in one tick; spring physics never run. Passes tsc + build but produces invisible animation. | Omit `duration` entirely — spring drives its own timing from stiffness/damping. |
| Agent worktree isolation creates from `main` | `isolation: "worktree"` in Agent tool creates branches from `main`, not the current feature branch. Workers can't find files that only exist on the feature branch. | Dispatch workers **without** `isolation: "worktree"` when they need to read/write files only on the current branch. Use worktree isolation only when branching from main is intentional. |
| Orbit stagger math no-op | Spec-suggested orbit: `translateX: [cos(θ)*r, cos(θ+2π)*r]`. `cos(θ+2π) === cos(θ)` — start equals end, particles sit still. | Keep 60-frame keyframe orbit (traces 60 distinct positions). Use `stagger` only for entrance/delay, not to encode position. |
| Glow crossfade async race condition | On rapid severity changes, the `.then()` callback from the first fade fires after the second fade has already applied, overwriting styles with stale closure values. | Store `fadeOutRef`/`fadeInRef`; pause both on re-entry. Read current severity/color from a `useRef` inside the callback (not from the closure). |
| `'-=600'` on first `createTimeline().add()` | `parseTimelinePosition` looks for a previous sibling to offset from; with no sibling, `-600` clamps to `0`. The glow's intended pre-entry effect becomes coincident with t=0. | Use `0` (absolute) on the first add. Only use relative offsets (`'+=300'`, `'-=200'`) when a sibling exists. |
| `'+300'` vs `'+=300'` in createTimeline | `'+300'` is parsed as **absolute** timestamp 300ms from start. `'+=300'` means "300ms after previous sibling ends". Easy to confuse. | Use `'+=N'` for relative (after prev), bare number `N` for absolute. Never `'+N'` — the leading `+` is ignored. |

---

## Immediate Next Steps

### Phase 6 — COMPLETE ✅

All 17 stories pass. Branch `feat-dashboard-redesign` merged to `main` on 2026-05-17 and pushed to GitHub. Vercel redeploys automatically on push.

**PRD final state:** `scripts/ralph/prd.json` — all 17 stories `passes: true`.

**Vercel deployment:** Push to `main` triggers auto-deploy. Check status at the Vercel dashboard or via `gh run list`.

### Step 1 — Optional: browser QA on deployed build

```bash
cd dashboard && npm run dev   # localhost:3000
```
Verify: tire centered, ring entrance animation plays, tread morphs with spring on lap scrub, particles orbit with spring entrance, scroll → tire lags behind (createAnimatable), chapter callouts update, speedometer top-left, circuit SVG visible.

**Reduced-motion check:** Enable `prefers-reduced-motion` in OS settings → rings should appear static (no rotation, no entrance). Tread should snap (no spring). All JS animations skipped.

### Step 2 — Optional: ingest multi-year data to improve model
```bash
~/.venv/bin/python evaluate.py --ingest   # expand to 2021/2023/2024/2025 (network required)
~/.venv/bin/python train_model.py         # retrain on multi-year data
~/.venv/bin/python evaluate.py            # regenerate outputs/ with multi-year model
~/.venv/bin/python strategy.py            # regenerate strategy_recommendations.json
```

---

## Label Methodology — Summary

Labels are heuristic proxy approximations, **not physical tire state measurements**.

**DegSeverity (0–3):** Based on `LapDelta` (fuel-corrected lap time vs stint best). Upgrades for sustained rolling trend (`RollingDelta3`) or accelerating degradation (`DegRateAccel`). Last 3 laps of non-final stints get +1 backward-label from pit stop.

**FailureMode priority:** graining > thermal > blistering > wear > none. Unreliable laps (`DegSeverity=-1`) override all.

**Known open items:**
- Thermal labels fire on any `PushRecoveryDelta < -0.30` within early stint — may capture racecraft/traffic patterns in cool conditions (British GP ~35°C track). Consider adding TrackTemp gate or requiring 2/3-lap persistence in a future session.
- `StintId=2` for RIC merges two physical stints due to a 5-lap gap with same TyreLife (laps 38–42 filtered out). Low impact on 2022 labels but could affect other years. Fix: trust FastF1 `Stint` column instead of re-deriving from TyreLife resets.

---

## Phase 2 — Feature Engineering Details

`build_feature_table.py` produces **112 features across 82 clean laps** for 2022.

Run to regenerate:
```bash
~/.venv/bin/python build_feature_table.py --year 2022
```

Dry-run (10 laps, 1 driver, fast smoke test):
```bash
~/.venv/bin/python build_feature_table.py --year 2022 --dry-run
```

Multi-year (all 5 Silverstone races):
```bash
~/.venv/bin/python build_feature_table.py
```

---

## Key Technical Constants

```python
# In build_feature_table.py
YEARS           = [2021, 2022, 2023, 2024, 2025]
TEAM            = "McLaren"
RACE            = "British Grand Prix"
MAX_LAP_SEC     = 130
OUTLIER_DELTA_CAP = 8.0        # keep in sync with build_labels.py
RACING_STATUSES = {"1", "2"}
FUEL_CORR_SEC_PER_KG = 0.035   # industry standard
HANGAR_BEARING_DEG   = 135.0   # Hangar Straight axis for wind projection
G               = 9.81

CORNER_ZONES = {
    "Copse":  (580,  820),
    "MB":    (1200, 2200),
    "Stowe": (3100, 3400),
    "Club":  (4200, 4700),
}

# In build_labels.py — thresholds recalibrated after Phase 4 data regen
SLEI_BLISTER          = 33.338  # p90 of rolling-window SLEI (2022), excl. 6 SLEI>100 telemetry-spike outliers
ROLLING_GRADE2_THRESH = 0.50
CONCAVITY_GRAIN       = 0.30
LAPVAR_GRAIN          = 0.50
```

---

## Tool Stack

### Python (backend — Phases 1–5)
| Tool | Version | Purpose |
|---|---|---|
| FastF1 | 3.8.3 | F1 telemetry ingestion |
| pandas | 2.3.3 | Data manipulation |
| numpy | 2.4.4 | Numerical (use `np.trapezoid`, never `np.trapz`) |
| scipy | 1.17.1 | `savgol_filter`, `spearmanr`, signal processing |
| xgboost | 3.2.0 | Severity + mode classifiers |
| shap | 0.49.1 | Model explainability (use `TreeExplainer(model)(X)` Explanation API) |
| plotly | 6.7.0 | HTML report charts |
| matplotlib | 3.10.9 | Static chart generation |
| pyarrow | installed | Parquet I/O |

### JavaScript (frontend — Phase 6 redesign)
| Tool | Version | Purpose |
|---|---|---|
| Next.js | 15 | React framework, Vercel native (no static export) |
| animejs | v4 | Tire rings, morphTo tread, particles, createDrawable circuit, stagger callouts |
| gsap + ScrollTrigger | 3 | Scroll-driven pin (500vh), chapter progress scrub |
| recharts | latest | Race Arc lap bands (chapter 4 background) |
| Tailwind CSS | 3 | Layout, utility classes |
| ~~@react-three/fiber~~ | — | **Deleted** — replaced by SVG (no WebGL in redesign) |
| ~~framer-motion~~ | — | Unused in redesign — all animation via anime.js + GSAP |

### AI/Media tools
| Tool | Purpose |
|---|---|
| Higgsfield CLI (`higgsfield generate create`) | Generate Silverstone flyover + F1 car static media assets |
| Anime.js skill (`animejs`) | Installed at `.agents/skills/animejs/` — full v4 API reference |
| GSAP skills (`gsap-*`) | Installed at `.agents/skills/gsap-*/` — available if complex scroll/timeline needed |
| gstack browse | SVG/CSS prototype testing (headless Chromium — WebGL NOT available) |

### Key CLI commands
```bash
# Python venv
~/.venv/bin/python <script>
~/.venv/bin/pytest tests/ -v

# Phase 5
~/.venv/bin/python evaluate.py --ingest   # ingest all years (network)
~/.venv/bin/python evaluate.py            # SHAP + validation + outputs

# Phase 6
cd dashboard && npm install && npm run dev   # dev server
cd dashboard && npm run build               # static export
```

---

## File Map

```
LatentLap-AI-main/
├── build_feature_table.py     ← Phase 2, DONE — 112 features, 5-year capable
├── build_labels.py            ← Phase 3, DONE — DegSeverity + FailureMode labels
├── explore_data.py            ← Phase 1, DONE — data validation
├── train_model.py             ← Phase 4, DONE — severity + mode XGBoost classifiers
├── evaluate.py                ← Phase 5, DONE — SHAP + validation + outputs
├── strategy.py                ← Phase 7, DONE — pit window extrapolation compute
├── CLAUDE.md                  ← Mandatory agent workflow rules
├── HANDOFF.md                 ← this file
├── .agents/skills/            ← Installed: animejs, gsap-*, deploy-to-vercel, web-design-guidelines
├── dashboard/                 ← Phase 6, EXISTS (Next.js 15 App Router)
│   ├── app/
│   │   ├── page.tsx           ← WILL BE REWRITTEN by redesign Task 11
│   │   ├── RaceContext.tsx    ← WILL ADD isTechnicalMode state (Task 1)
│   │   ├── layout.tsx
│   │   └── components/        ← existing panels (to be deleted in Task 11)
│   ├── lib/
│   │   ├── data.ts            ← UNCHANGED (getLap, getAllLapsForDriver, getSHAP)
│   │   ├── severityColors.ts  ← UNCHANGED (getSeverityHex, getSeverityLabel)
│   │   └── circuitSvg.ts      ← NEW (Task 1): 2D Silverstone waypoints for SVG
│   ├── styles/globals.css     ← WILL ADD compound/severity CSS vars (Task 1)
│   └── public/data/           ← UNCHANGED JSON artifacts
│       └── prototype/
│           └── track_styles.html  ← old prototype (can be deleted)
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   ├── 2026-05-14-phase5-evaluate-design.md   ← APPROVED
│       │   ├── 2026-05-14-phase6-dashboard-design.md  ← superseded by redesign
│       │   ├── 2026-05-15-phase7-strategy-design.md   ← APPROVED
│       │   └── 2026-05-16-dashboard-redesign-design.md ← ACTIVE SPEC (Pirelli colors updated)
│       └── plans/
│           ├── 2026-05-15-phase5-evaluate.md    ← Phase 5 plan
│           ├── 2026-05-15-phase6-dashboard.md   ← superseded by redesign
│           ├── 2026-05-15-phase7-strategy.md    ← Phase 7 plan
│           └── 2026-05-16-dashboard-redesign.md ← ACTIVE PLAN (13 tasks)
├── models/                    ← gitignored; regenerate with train_model.py
│   ├── severity_model.ubj
│   ├── mode_model.ubj
│   ├── feature_list.json      ← 84 feature names (shared input schema)
│   └── cv_results.json        ← severity F1=0.162, mode F1=0.445
├── data/                      ← gitignored
│   ├── feature_table.csv      ← 2022 only (82 laps × 112 features)
│   └── labeled_table.csv      ← 2022 only (82 laps × 115 cols)
├── tests/
│   ├── test_build_feature_table.py
│   ├── test_build_labels.py
│   ├── test_train_model.py
│   ├── test_evaluate.py
│   └── test_strategy.py       ← Phase 7, 34 tests
└── cache/                     ← FastF1 cache, do not delete
```

---

## Design Constraints (do not violate)

- **No exact tire wear percentages** — predict degradation likelihood, not wear %
- **No exact tire temperatures** — all thermal features are proxies
- **No deep learning for v1** — XGBoost only; add HMM post-processing later if needed
- **All outputs probabilistic** — severity as 0–3 scale, not binary
- **Label methodology must be documented** — heuristic labels, not physical ground truth
- **Scope: McLaren + Silverstone only** — no multi-team generalization in MVP
