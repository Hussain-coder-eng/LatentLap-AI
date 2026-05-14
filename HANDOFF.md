# LatentLap-AI — Agent Handoff Document

Generated: 2026-05-14  
Project root: `/Users/hussianaltufayli/Downloads/LatentLap-AI-main`  
Python env: `~/.venv/bin/python`

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
| 2 — Feature engineering | ✅ Done | `build_feature_table.py` |
| 3 — Weak supervision labels | ⬜ Not started | `build_labels.py` (to be created) |
| 4 — XGBoost model | ⬜ Not started | `train_model.py` (to be created) |
| 5 — SHAP explainability + validation | ⬜ Not started | `evaluate.py` (to be created) |
| 6 — Streamlit dashboard | ⬜ Not started | `app.py` (to be created) |

---

## Current Progress

### Phase 1 — Complete

`explore_data.py` validates the FastF1 data pipeline:
- 7.7 Hz telemetry confirmed (not 4 Hz)
- Channels: Speed, Throttle, Brake, nGear, RPM, DRS, X, Y, Distance, DistanceToDriverAhead
- Maggotts-Becketts zone 1200–2200m validated against actual telemetry trace
- TrackStatus filter confirmed working (SC/VSC excluded)
- Outputs in `data_exploration/`

### Phase 2 — Complete

`build_feature_table.py` produces **112 features across 82 clean laps** for 2022:

```
data/feature_table.csv       111.2 KB
data/feature_table.parquet   113.2 KB
```

Both files are ready for Phase 3.

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

## Feature Table: 112 Features

Key feature groups in `data/feature_table.csv`:

**Pace degradation:** `LapTimeSec`, `FuelEstKg`, `FuelCorrLapTime`, `LapDelta`, `RollingDelta3`, `LapVariance`, `DeltaRate`, `S2Delta`, `DegRateAccel`, `S3_S1_Decay`, `S3_S1_DecayZ`, `PushRecoveryDelta`, `EarlyStintConcavity`

**Driver aggression:** `ThrottleRate`, `ThrottleVariance`, `BrakeDecel`, `LockupEvents`, `LiftCoastEvents`, `LiftCoastTimePct`, `AggressionZ`

**Tire energy / load:** `LatEnergyTotal`, `LongEnergyTotal`, `SLEI` (Sustained Lateral Energy Index — blistering proxy), `HighGTimeSec`, `HighSpeedCornerSec`, `MaxLatG`, `AvgLatG`, `FL_LoadAsymmetry`, `RightHandGSec`, `LeftHandGSec`

**Corner zones** (×4 corners — Copse, MB, Stowe, Club):  
`_EntrySpeed`, `_MinSpeed`, `_PeakLatG`, `_AvgLatG`, `_BrakeFraction`, `_AvgThrottle`, `_TimeSec`  
MB also has: `MB_PreBrakeLatG`, `MB_PreBrakeSpeed`, `MB_PreBrakeTime`, `MB_ExitThrottle`

**Race context:** `CompoundCode`, `TyreLife`, `FuelEstKg`, `TrackTemp`, `AirTemp`, `Humidity`, `WindSpeed`, `WindDirection`, `WindProjectionHangar`, `CompoundOOW`, `MeanGapAhead`, `DirtyAirRatio`, `OutLap`, `InLap`, `PostSC_Lap`

**Composite derived:** `ThermalAccumProxy`, `CumLatEnergy`, `StintEnergyFraction`, `SeverityIndex`, `EffectivePushFactor`, `SlipProxy`, `YawSpikeCount`, `AvgYawRate`, `ThrottleRate_DriverZ`, `BrakeDecel_DriverZ`, `SlipProxy_DriverZ`

**Known missing values (expected, not bugs):**  
`PushRecoveryDelta`: 7 NaN values — first lap of each stint has no prior lap to compare. Safe to fill with 0 in Phase 3.

---

## What Worked

- **FastF1 cache**: All 2022 data cached locally in `cache/`. Subsequent runs load instantly.
- **`filter_laps()`**: TrackStatus `{"1","2"}` + `IsAccurate` + 130s max guard correctly removes SC/VSC laps including the Zhou crash restart lap (139.6s) that passed `IsAccurate`.
- **Signed curvature from X/Y**: Savitzky-Golay (window=11, polyorder=3) on X/Y then `kappa = (dx*ddy - dy*ddx) / (dx²+dy²)^1.5` gives reliable signed lateral G. Critical for separating FL vs FR tire loading.
- **Passing original FastF1 `laps` object to `build_telemetry_features()`**: Do NOT pass the modified pandas DataFrame — `lap.get_telemetry()` only works on original FastF1 Lap objects.
- **Fuel correction**: `FuelCorrLapTime = LapTimeSec - 0.035 × FuelEstKg` removes ~3–4s fuel effect across stint, making `LapDelta` a clean degradation signal.
- **EarlyStintConcavity**: Loop-based implementation (not `groupby.apply()`) avoids pandas 2.x multi-column DataFrame assignment bug.
- **ThermalAccumProxy**: Same fix — loop over groups, build dict, assign as Series.
- **`np.trapezoid`**: NumPy 2.x removed `np.trapz` — use `np.trapezoid` throughout.

---

## What Didn't Work (don't repeat these)

| Mistake | Why it failed | Fix |
|---|---|---|
| `pick_team()`/`pick_driver()` | Deprecated in FastF1 v3.x | Use `pick_teams()`/`pick_drivers()` |
| 130s lap time guard omitted | SC restart lap (139.6s) passed `IsAccurate`, contaminating data | Always filter `LapTimeSec < 130` |
| `lap.get_telemetry()` on modified DataFrame rows | FastF1 metadata lost after pandas copy/transform | Pass original `session.laps.pick_teams(TEAM)` object, not modified df |
| `LapNumber` dtype in merge key | `int(lap["LapNumber"])` vs `float` in DataFrame caused merge failure | Use `lap["LapNumber"]` without casting |
| `groupby(...).apply(fn_returning_Series)` for scalar-per-group | Pandas 2.x interprets result as multi-column DataFrame | Use explicit `for key, grp in df.groupby(...)` loop + dict |
| `np.trapz` | Removed in NumPy 2.0 | Use `np.trapezoid` |
| `dataprep.clean.clean_df` on telemetry | Designed for messy human-entered data, wrong tool | Use `dataprep.eda.create_report` for EDA |
| HuggingFace datasets for tire labels | No F1 tire label datasets exist publicly | Heuristic proxy labeling is the correct approach |

---

## Immediate Next Steps

### Step 1 — Run dataprep EDA (validation before labeling)

```python
pip install dataprep
from dataprep.eda import create_report
import pandas as pd
df = pd.read_csv("data/feature_table.csv")
create_report(df).show_browser()
```

Look for: unexpected correlations, distribution anomalies, any features that are near-constant (may need to drop or transform). Do NOT use `clean_df` — wrong tool for this data.

---

### Step 2 — Build `build_labels.py` (Phase 3: Weak Supervision)

Create heuristic degradation labels. True tire state labels are not publicly available — proxy labels must be clearly documented as approximations, not physical measurements.

**Degradation severity target (0–3 per lap):**

```python
# Suggested labeling logic (implement in build_labels.py):

# Grade 2+ trigger: rolling lap-time decay > 0.4s vs rolling median
# Grade 3 trigger: sector collapse > 0.6s OR DegRateAccel > threshold
# Grade 0: FuelCorrLapTime within 0.2s of stint best, low SLEI

# Backward-label from pit stops:
# Laps N-3 to N before an unplanned pit = elevated severity
```

**Failure mode categorical labels:**

| Mode | Key signals |
|---|---|
| Graining | `EarlyStintConcavity > 0` (concave-up), high `LapVariance` early stint, `TyreLife < 10` |
| Blistering | `SLEI` spike, late-stint `DegRateAccel` surge, high `ThermalAccumProxy` |
| Thermal | Rapid early degradation with partial recovery (`PushRecoveryDelta` pattern) |
| Wear | Monotonic `LapDelta` increase across stint, high `CumLatEnergy` |

**Reference for validation:** Silverstone 2022 is the reference race — well-documented blistering incident (multiple teams affected). Predicted blistering severity should spike before McLaren's pit stops.

---

### Step 3 — Train XGBoost model (Phase 4)

```python
# Rough structure for train_model.py:
import xgboost as xgb
from sklearn.model_selection import GroupShuffleSplit

# Features: all numeric cols except labels, housekeeping, and raw times
# Target: DegSeverity (0-3) for severity classifier
#         FailureMode (graining/blistering/thermal/wear) for mode classifier
# Group: Year — use leave-one-year-out CV (train on 4 years, validate on held-out)
```

---

### Step 4 — SHAP + Validation (Phase 5)

Key validation checks:
- Degradation probability rises before observed pit stops
- Predictions correlate with pace decay (Spearman rank)
- Maggotts-Becketts features (`MB_PeakLatG`, `MB_TimeSec`) appear in top SHAP features
- Held-out race (Silverstone 2024) used for out-of-sample evaluation

---

### Step 5 — Streamlit Dashboard (Phase 6)

Stack: Streamlit + Plotly

Panels:
1. Race timeline: degradation severity band per lap (green→red), overlaid on lap delta
2. Tire health indicator: current severity class + failure mode probability bars
3. Feature explanation: top-3 SHAP features driving current prediction
4. Stint comparison: NOR vs RIC degradation trajectories side-by-side
5. Race selector: year, driver

---

## Key Technical Constants

```python
# In build_feature_table.py
YEARS           = [2021, 2022, 2023, 2024, 2025]
TEAM            = "McLaren"
RACE            = "British Grand Prix"
MAX_LAP_SEC     = 130
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

# DRS: 0=unavailable, 2=eligible, 8=opening, 10=open, 14=closing
# DRS_Open = DRS.isin([10, 14])

# Compounds: Soft=0, Medium=1, Hard=2, Intermediate=3, Wet=4
```

---

## Tool Stack

| Tool | Version | Purpose |
|---|---|---|
| FastF1 | 3.8.3 | Telemetry ingestion |
| pandas | 2.x | Data manipulation |
| numpy | 2.x | Numerical (use `np.trapezoid`, not `np.trapz`) |
| scipy | 1.17.1 | `savgol_filter` for X/Y smoothing |
| pyarrow | installed | Parquet I/O |
| xgboost | to install | Phase 4 model |
| shap | to install | Phase 5 explainability |
| streamlit | to install | Phase 6 dashboard |
| plotly | to install | Phase 6 charts |
| dataprep | to install | EDA before Phase 3 |

Install missing deps:
```bash
~/.venv/bin/pip install xgboost shap streamlit plotly dataprep
```

---

## File Map

```
LatentLap-AI-main/
├── build_feature_table.py   ← Phase 2, DONE — 112 features
├── explore_data.py          ← Phase 1, DONE — data validation
├── README.md                ← original project readme
├── HANDOFF.md               ← this file
├── cache/                   ← FastF1 cache (do not delete)
├── data/
│   ├── feature_table.csv    ← 82 laps × 112 features (MAIN INPUT for Phase 3)
│   └── feature_table.parquet
└── data_exploration/
    ├── mcl_silverstone_2022_laps_clean.csv
    ├── nor_fastest_lap_telemetry_clean.csv
    ├── nor_dirty_air_per_lap.csv
    └── silverstone_2022_weather.csv
```

---

## Design Constraints (do not violate)

- **No exact tire wear percentages** — predict degradation likelihood, not wear %
- **No exact tire temperatures** — all thermal features are proxies
- **No deep learning for v1** — XGBoost only; add HMM post-processing later if needed
- **All outputs probabilistic** — severity as 0–3 scale, not binary
- **Label methodology must be documented** — heuristic labels, not physical ground truth
- **Scope: McLaren + Silverstone only** — no multi-team generalization in MVP
