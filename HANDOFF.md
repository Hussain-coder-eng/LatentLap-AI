# LatentLap-AI — Agent Handoff Document

Generated: 2026-05-14 | Last updated: 2026-05-15
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
| 4 — XGBoost model | ✅ Done | `train_model.py` |
| 5 — SHAP explainability + validation | 📋 Spec approved | `evaluate.py` (to be created) |
| 6 — Interactive web dashboard | 📋 Spec approved | `dashboard/` (Next.js app, to be created) |

---

## Current State

### Current State — Entering Phase 5 Implementation

Phases 1–4 are complete. The CRITICAL BLOCKER from the previous session (stale feature_table.csv) has been resolved — Phase 4 was trained on the regenerated, corrected feature table. The STALE thresholds in build_labels.py were recalibrated as part of Phase 4 preparation.

**Data coverage:** `data/labeled_table.csv` currently contains **2022 Silverstone only** (82 laps). Phase 5's `--ingest` flag will expand this to all 5 years (2021–2025) by calling `build_feature_table.py --year <N>` + `build_labels.py` for each missing year. This requires network access to download FastF1 data.

**Models present:** `models/severity_model.ubj`, `models/mode_model.ubj`, `models/feature_list.json`, `models/cv_results.json` (gitignored — regenerate with `~/.venv/bin/python train_model.py`).

**Implementation plans:** Not yet written. Next action is to run `superpowers:writing-plans` skill for Phase 5, then Phase 6.

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
mode_probs = mode_model.predict_proba(df[features].values)  # shape (n, 3), classes: none/thermal/wear
```

Note: Models are not committed to git. Run `~/.venv/bin/python train_model.py` to regenerate.

---

## Phase 5 — Spec Approved, Implementation Pending

### Spec location
`docs/superpowers/specs/2026-05-14-phase5-evaluate-design.md`

### What will be built
`evaluate.py` — SHAP explainability + 4 validation checks + output artifacts for Phase 6 dashboard.

**Two modes:**
```bash
~/.venv/bin/python evaluate.py --ingest   # Step 1: ingest 2021/2023/2024/2025 → regen labeled_table.csv (network required)
~/.venv/bin/python evaluate.py            # Step 2: SHAP + validation → outputs/
```

**Output artifacts:**
```
outputs/
├── shap_report.html          # Self-contained HTML (shareable portfolio artifact)
├── shap_data.json            # Per-lap SHAP values for all years/drivers
├── predictions.json          # Severity + mode probabilities per lap/year/driver
└── validation_report.json    # 4 validation check results (numeric + pass/fail)
```

**4 validation checks (priority order):**
1. SHAP Feature Importance — `MB_PeakLatG` or `MB_TimeSec` in top-5 SHAP for severity model
2. Pit Timing Hit Rate — DegSeverity >= 2 in 3 laps before >= 50% of pit stops
3. Spearman Rank Correlation — rho > 0.3 on 2022 NOR blistering stint
4. Out-of-sample 2024 — weighted-F1 >= 0.10 on held-out 2024 data (skipped if data absent)

**LAP_KEY format:** `"{year}_{driver}_{lap_number}"` (e.g. `"2022_NOR_32"`)

**track_progress formula:** `(LapNumber - 1) / max_LapNumber_for_year` — maps to `curve.getPointAt()` in Phase 6.

**Test file:** `tests/test_evaluate.py` (6 test functions matching spec).

**Key dependencies (all installed):**
- shap 0.49.1
- scipy 1.17.1
- plotly 6.7.0 (for HTML report figures)
- xgboost 3.2.0
- pandas 2.x, numpy 2.x

**SHAP API for v0.49.x with XGBoost:**
```python
import shap
explainer = shap.TreeExplainer(model)
shap_expl = explainer(X)   # returns Explanation object
# shap_expl.values: (n_samples, n_features) or (n_samples, n_features, n_classes) for multiclass
# Use mean(|shap_expl.values|, axis=0) for feature importance (average over classes for multiclass)
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

---

## Immediate Next Steps

### Step 1 — Write Phase 5 implementation plan
Invoke `superpowers:writing-plans` skill (or ask Claude to write it).
Plan saves to: `docs/superpowers/plans/2026-05-15-phase5-evaluate.md`

### Step 2 — Implement Phase 5 (`evaluate.py`)
Use `superpowers:subagent-driven-development` to execute the plan.
Run `~/.venv/bin/python evaluate.py --ingest` first (network required), then default mode.

### Step 3 — Write Phase 6 implementation plan
Invoke `superpowers:writing-plans` for the dashboard.
Plan saves to: `docs/superpowers/plans/2026-05-15-phase6-dashboard.md`

### Step 4 — Implement Phase 6 (`dashboard/`)
Scaffold Next.js app in `dashboard/`. Generate Higgsfield assets first.
Deploy to Vercel when complete.

### Step 5 — Regenerate labeled_table.csv for all years (when network available)
```bash
~/.venv/bin/python evaluate.py --ingest
```
This ingests 2021/2023/2024/2025 data. Retrain models after:
```bash
~/.venv/bin/python train_model.py
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
SLEI_BLISTER          = 3.50
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
├── evaluate.py                ← Phase 5, TO CREATE
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
│       │   └── 2026-05-14-phase6-dashboard-design.md  ← APPROVED (v2: Anime.js + Camera POV)
│       └── plans/
│           └── (plans to be written next)
├── models/                    ← gitignored; regenerate with train_model.py
│   ├── severity_model.ubj
│   ├── mode_model.ubj
│   ├── feature_list.json      ← 84 feature names (shared input schema)
│   └── cv_results.json        ← severity F1=0.162, mode F1=0.445
├── data/                      ← gitignored
│   ├── feature_table.csv      ← 2022 only (82 laps × 112 features)
│   └── labeled_table.csv      ← 2022 only (82 laps × 115 cols)
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
