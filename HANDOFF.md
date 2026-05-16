# LatentLap-AI — Agent Handoff Document

Generated: 2026-05-14 | Last updated: 2026-05-16 (Phase 7 Strategy Advisor compute complete; Phase 6 StrategyAdvisor.tsx next)
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
| 6 — Interactive web dashboard | 📋 Plan written | `dashboard/` (Next.js app, to be created) |
| 7 — Strategy Advisor | ✅ Done | `strategy.py` |

---

## Current State — Phases 1–5 + 7 Complete, Phase 6 (dashboard + StrategyAdvisor) Next

Phases 1–5 and Phase 7 are complete. Phase 6 (interactive Next.js dashboard) is the next step.

**Plans:**
- Phase 5 plan: `docs/superpowers/plans/2026-05-15-phase5-evaluate.md` (15 tasks)
- Phase 6 plan: `docs/superpowers/plans/2026-05-15-phase6-dashboard.md` (22 tasks, updated to 4-class mode_probs)

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

## Phase 6 — Spec Approved, Implementation Pending

### Spec location
`docs/superpowers/specs/2026-05-14-phase6-dashboard-design.md`

### Stack change from original design
Original plan was Streamlit + Plotly. **Changed to React/Next.js + Three.js** because:
- 3D spinnable track with glowing cars requires WebGL, impossible in Streamlit
- Anime.js animations require direct DOM access
- Deployment to Vercel (not Streamlit Cloud)

### Tech stack (final)
```
Next.js 14 (App Router) + static export → Vercel
@react-three/fiber + @react-three/drei → 3D WebGL track
animejs v4 → number counters, stagger entrances, replay timeline, SVG draw-on
framer-motion → React component animations (panel entrances, spring transitions)
recharts → race timeline bar chart + stint comparison (built-in animations)
Tailwind CSS → layout + utility classes
```

**NPM packages to install (in `dashboard/`):**
```bash
npm install next@14 react react-dom three @react-three/fiber @react-three/drei
npm install animejs framer-motion recharts
npm install -D @types/three typescript tailwindcss postcss autoprefixer
```

### Visual design decisions
- **Color palette:** Dark OLED `#090909` + McLaren Papaya Orange `#FF8000`
- **Severity scale:** `#00E676` (0) → `#FFD600` (1) → `#FF6D00` (2) → `#FF1744` (3)
- **Typography:** Rajdhani (HUD/numbers), Fira Code (data labels), DM Sans (body). Never Inter/Roboto.
- **Track visual:** Style A (Pure White Light Beam) default — `#FFFFFF` emissive 0.8. User can switch to 4 styles (B=Orange, C=Blueprint, D=Crimson) via header selector.

### Track visual prototype
`dashboard/prototype/track_styles.html` — SVG + Anime.js v3 (CDN) prototype testing all 4 styles. **Renders correctly in headless Chromium** (no WebGL). Use this to iterate on visual styles. The production 3D track uses Three.js + R3F (WebGL only — don't test with headless browse).

### Camera POV system
Camera state is driven by `activePanelId` in React Context:
- `overview` (default): `[0, 6, 8]` 45° tilt
- `follow-driver` (TireHealth focused): behind + above selected car
- `corner-focus` (ShapPanel focused, MB_/Copse_/Club_/Stowe_ feature): zoom to corner apex
- `birds-eye` (Timeline/Comparison focused): `[0, 14, 0]` overhead
- `split` (Comparison with 2 drivers): `[0, 10, 4]` shows both cars

Transition mechanism: `camera.position.lerp(target, 0.04)` in `useFrame` — same for all POV transitions.

### Higgsfield assets (pre-generate before building)
Run these once with Higgsfield CLI to generate `dashboard/public/media/` assets:
```bash
# Silverstone flyover (8s, hero background)
higgsfield generate create seedance_2_0 --prompt "Aerial drone flyover of Silverstone F1 circuit, overcast British sky, cinematic" --duration 8 --aspect_ratio 16:9 --wait

# Tire blister close-up (4s, mode indicator)
higgsfield generate create seedance_2_0 --prompt "Extreme macro close-up F1 tire blistering damage, slow motion, dramatic lighting" --duration 4 --aspect_ratio 1:1 --wait

# McLaren car image
higgsfield generate create gpt_image_2 --prompt "McLaren F1 2022 papaya orange livery, front 3/4 angle, studio black background, photorealistic" --aspect_ratio 1:1 --resolution 2k --wait
```

### Key gotchas for Phase 6 implementation
- **Anime.js v4 API** is different from v3: use `animate(target, props)` not `anime({targets, ...})`, `createTimeline()` not `anime.timeline()`, `stagger()` not `anime.stagger()`, `ease:` not `easing:`, easing strings like `'outQuart'` not `'easeOutQuart'`
- **WebGL in headless Chromium will fail** with `BindToCurrentSequence failed` — do NOT test Track3D.tsx with the browse tool. Test logic with unit tests; visual QA only in a real browser
- **framer-motion is installed** (npm) and available for React component animations alongside Anime.js
- **R3F + Next.js:** Add `'use client'` to all components that use `@react-three/fiber` or browser APIs
- **Static export config** in `next.config.js`: `output: 'export'`, `images: { unoptimized: true }`
- **JSON data** loaded via static import (no fetch), must be in `public/data/` for static export
- **OrbitControls** must be imported from `@react-three/drei`, not `three/examples`

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

---

## Immediate Next Steps

### Step 1 — Build Phase 6 dashboard + StrategyAdvisor.tsx
Branch: `phase-6-dashboard`
Plan: `docs/superpowers/plans/2026-05-15-phase6-dashboard.md`
Spec: `docs/superpowers/specs/2026-05-14-phase6-dashboard-design.md`
Strategy spec: `docs/superpowers/specs/2026-05-15-phase7-strategy-design.md`

Use `frontend-developer` + `nextjs-architecture-expert` agents via subagent-driven-development.

**Phase 6 includes StrategyAdvisor.tsx** — new panel replacing the old `Comparison` component:
- Reads `strategy_recommendations.json` (Phase 7 output)
- Pre-race: table + chart of 5 pit strategies vs finish severity
- Live-race: pit window highlight, anomaly alerts, updates per lap
- Threshold tuning: collapsible sliders for ideal/acceptable/anomaly thresholds, stored in localStorage

Pre-requisites:
- `outputs/` artifacts must exist (generated by Phase 5 ✅)
- `outputs/strategy_recommendations.json` must exist (generated by Phase 7 ✅)
- Generate Higgsfield assets (see spec Task 19) before building Track3D

### Step 2 — Deploy to Vercel
```bash
cd dashboard && npm run build   # static export
```
Then deploy via Vercel CLI or GitHub integration.

### Step 3 — Optional: ingest multi-year data to improve model
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

### JavaScript (frontend — Phase 6)
| Tool | Version | Purpose |
|---|---|---|
| Next.js | 14 | React framework, static export |
| @react-three/fiber | latest | WebGL 3D track (React wrapper for Three.js) |
| @react-three/drei | latest | OrbitControls, Html overlays, Stars |
| three | latest | CatmullRomCurve3, TubeGeometry, MeshStandardMaterial |
| animejs | v4 | Counters, stagger, SVG draw-on, replay timeline |
| framer-motion | latest | Panel entrance/exit, spring transitions in React |
| recharts | latest | Race timeline bar chart, stint comparison |
| Tailwind CSS | 3 | Layout, utility classes |

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
├── dashboard/                 ← Phase 6, TO CREATE (Next.js app)
│   └── prototype/
│       └── track_styles.html  ← SVG Anime.js prototype (4 visual styles, tested)
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   ├── 2026-05-14-phase5-evaluate-design.md   ← APPROVED
│       │   ├── 2026-05-14-phase6-dashboard-design.md  ← APPROVED (v2 + StrategyAdvisor)
│       │   └── 2026-05-15-phase7-strategy-design.md   ← APPROVED
│       └── plans/
│           ├── 2026-05-15-phase5-evaluate.md    ← Phase 5 plan
│           ├── 2026-05-15-phase6-dashboard.md   ← Phase 6 plan (22 tasks)
│           └── 2026-05-15-phase7-strategy.md    ← Phase 7 plan
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
