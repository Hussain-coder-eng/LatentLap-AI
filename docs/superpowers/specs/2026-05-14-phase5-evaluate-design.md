# Phase 5 — SHAP Explainability + Validation (`evaluate.py`)

**Date:** 2026-05-14  
**Status:** APPROVED  
**Project:** LatentLap-AI — McLaren Tire Degradation Intelligence System  
**Author:** Hussain Altufayli  

---

## Problem Statement

Phase 4 produced two XGBoost classifiers (severity + mode) trained on 2022 Silverstone data only. Before the Phase 6 dashboard can be built, we need:

1. All 5 years (2021–2025) of Silverstone data ingested, labeled, and models retrained or verified on the expanded set.
2. SHAP-based interpretability so engineers can see *why* a prediction was made.
3. Quantitative validation that predictions behave realistically (pit timing, pace correlation, SHAP feature plausibility, out-of-sample test).
4. Pre-computed JSON artifacts that the Phase 6 React dashboard loads statically — no Python runtime required in the frontend.

---

## Scope

**In scope:**
- `evaluate.py` script (new file)
- Multi-year data ingestion via `--ingest` flag
- SHAP computation for both severity and mode models
- 4 validation checks (prioritised below)
- HTML report output
- JSON artifact output consumed by Phase 6

**Out of scope:**
- Re-tuning XGBoost hyperparameters (Phase 4 locked them)
- Any frontend rendering (Phase 6)
- HMM temporal smoothing (post-MVP)

---

## Architecture

### Two modes

```
evaluate.py --ingest          # Step 1: ingest all missing years → regen labeled_table.csv
evaluate.py                   # Step 2: run SHAP + validation → outputs HTML + JSON
```

The `--ingest` flag calls `build_feature_table.py` for each of `[2021, 2022, 2023, 2024, 2025]` that is missing from `data/labeled_table.csv`, then runs `build_labels.py` to re-label the merged table. Network required. Once ingested, the default run never touches the network again.

### Output files

```
outputs/
├── shap_report.html          # Self-contained HTML (shareable portfolio artifact)
├── shap_data.json            # Per-lap SHAP values for all years/drivers (Phase 6 input)
├── predictions.json          # Severity + mode probabilities per lap/year/driver (Phase 6 input)
└── validation_report.json    # All 4 validation check results (numeric + pass/fail)
```

---

## Validation Checks — Priority Order

### Priority 1: SHAP Feature Importance

**Why first:** Core of the "virtual tire engineer" story. Maggotts-Becketts features appearing in the top 5 is the primary proof that the model learned from physics, not noise.

**What to compute:**
- `shap.TreeExplainer` on both `severity_model` and `mode_model`
- Global: `shap.summary_plot` (beeswarm) on the full labeled table
- Per-stint: SHAP waterfall for NOR 2022 Medium stint (the blistering stint) — this is the narrative anchor
- Feature importance bar chart (mean |SHAP| across all laps)

**Pass criterion:** `MB_PeakLatG` or `MB_TimeSec` appears in top 5 by mean |SHAP| for severity model.

**Output in JSON:**
```json
{
  "shap_values": {
    "severity": { "LAP_KEY": { "FEATURE": shap_value, ... }, ... },
    "mode":     { "LAP_KEY": { "FEATURE": shap_value, ... }, ... }
  },
  "top_features": {
    "severity": [["MB_PeakLatG", 0.34], ["TyreLife", 0.28], ...],
    "mode":     [["ThermalAccumProxy_raw", 0.21], ...]
  }
}
```

LAP_KEY format: `"{year}_{driver}_{lap_number}"` — used by Phase 6 to index SHAP for any selected lap.

---

### Priority 2: Pit Stop Timing

**Why second:** Most compelling narrative for a recruiter — "the model flagged severity ≥ 2 in the 3 laps before every unscheduled stop."

**What to compute:**
- Identify all pit stops from `labeled_table.csv` (lap where `StintId` increments)
- For each pit: check whether `DegSeverity_pred ≥ 2` occurred in the 3 laps prior
- Compute hit rate: `n_pits_with_prior_warning / total_pits`
- Visualise as an event timeline per driver/year

**Pass criterion:** Hit rate ≥ 0.5 (majority of pits had a preceding warning).

---

### Priority 3: Spearman Rank Correlation

**What to compute:**
- Predicted severity rank vs actual `LapDelta` rank, per driver per stint
- `scipy.stats.spearmanr(predicted_severity, lap_delta)`
- Report ρ and p-value per stint + weighted average across all stints

**Pass criterion:** ρ > 0.3 on the 2022 NOR blistering stint (well-documented degradation arc).

---

### Priority 4: Out-of-Sample Evaluation (2024 held-out)

**What to compute:**
- Train on 2021–2023 + 2025 rows; test on 2024 Silverstone only
- Compute weighted-F1 for severity and mode on 2024 test set
- Compare to 2022 in-distribution LOO-CV F1 (from `models/cv_results.json`)
- Produce confusion matrix for 2024 severity

**Pass criterion:** 2024 weighted-F1 ≥ 0.10 (any signal above random on unseen year).

**Note:** Only runs if 2024 data is present in `data/labeled_table.csv`. Skipped with a warning otherwise.

---

## HTML Report Structure

Self-contained (all charts embedded as base64 or inline Plotly JSON). Renderable by opening the file in any browser — no server needed.

```
Section 1 — Executive Summary
  4 metric cards: top SHAP feature | pit-timing hit rate | Spearman ρ | 2024 F1
  Pass/Fail badge per validation check

Section 2 — SHAP Beeswarm (Severity Model, global, all laps)

Section 3 — SHAP Beeswarm (Mode Model, global)

Section 4 — Stint Waterfall
  NOR 2022 Medium stint, lap-by-lap waterfall for severity model
  Anchor: "This is the confirmed McLaren blistering incident at 2022 British GP"

Section 5 — Pit Timing Event Plot
  Timeline per year/driver, severity band + pit markers, pre-pit warning highlighted

Section 6 — Spearman Scatter
  Predicted severity rank vs LapDelta rank, one scatter per stint

Section 7 — 2024 Confusion Matrix (if data present)
```

---

## JSON Schema: `predictions.json`

```json
{
  "meta": {
    "years": [2021, 2022, 2023, 2024, 2025],
    "drivers": ["NOR", "RIC", "PIA"],
    "severity_classes": [0, 1, 2, 3],
    "mode_classes": ["none", "thermal", "wear"],
    "features": ["AggressionZ", "AirTemp", ...]
  },
  "laps": [
    {
      "key": "2022_NOR_32",
      "year": 2022,
      "driver": "NOR",
      "lap_number": 32,
      "stint_id": 1,
      "compound": "MEDIUM",
      "tyre_life": 18,
      "lap_delta": 1.24,
      "severity_true": 3,
      "severity_pred": 2,
      "severity_probs": [0.05, 0.12, 0.41, 0.42],
      "mode_true": "blistering",
      "mode_pred": "wear",
      "mode_probs": {"none": 0.11, "thermal": 0.18, "wear": 0.71},
      "track_progress": 0.623
    },
    ...
  ]
}
```

`track_progress` (0–1) = `(lap_number_within_stint - 1) / total_laps_in_race`. Simple linear proxy — good enough to space cars visibly apart on the 3D track. No sector-split telemetry needed. Phase 6 maps this directly to `curve.getPointAt(track_progress)` on the Silverstone spline.

---

## Module Structure

```
evaluate.py
  ├── ingest_all_years()          # calls build_feature_table.py + build_labels.py per year
  ├── load_data()                 # loads labeled_table.csv + both models
  ├── compute_shap()              # TreeExplainer → shap_data.json
  ├── compute_predictions()       # predict_proba for all laps → predictions.json
  ├── validate_pit_timing()       # priority 2 check
  ├── validate_spearman()         # priority 3 check
  ├── validate_oos_2024()         # priority 4 check (skips if no 2024 data)
  ├── build_html_report()         # assembles all sections → shap_report.html
  └── main()                      # orchestrates, writes outputs/
```

---

## Testing

New test file: `tests/test_evaluate.py`

- `test_compute_predictions_schema` — output JSON matches spec schema
- `test_shap_data_keys_match_predictions` — every lap key in predictions has a SHAP entry
- `test_pit_timing_hit_rate_in_range` — hit rate in [0, 1]
- `test_spearman_values_bounded` — all ρ in [-1, 1]
- `test_html_report_exists_and_nonzero` — file created, size > 10KB
- `test_track_progress_bounded` — all `track_progress` values in [0, 1)

---

## Design Constraints

- No label-leaking features in predictions (same exclusion list as Phase 4)
- SHAP computed on the final retrained model (not the CV fold models)
- HTML report must render without internet access
- JSON files must stay under 10 MB total (dashboard loads them statically)
- All validation check results stored in `validation_report.json` — never hardcoded into HTML
