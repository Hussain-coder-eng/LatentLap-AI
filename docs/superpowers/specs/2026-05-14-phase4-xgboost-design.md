# Phase 4 — XGBoost Classifier Design

**Date:** 2026-05-14
**Script:** `train_model.py` (to be created)
**Depends on:** Phase 3 output `data/labeled_table.csv` (must be regenerated — see blocker below)

---

## Blocker: Regenerate Data Before Training

`feature_table.csv` and `labeled_table.csv` contain pre-fix contamination. Run in order:

```bash
~/.venv/bin/python build_feature_table.py --year 2022
~/.venv/bin/python build_labels.py
```

Then recalibrate the four `⚠ STALE` thresholds in `build_labels.py`:
- `SLEI_BLISTER` → p90 of corrected SLEI distribution
- `ROLLING_GRADE2_THRESH` → after masked RollingDelta3
- `CONCAVITY_GRAIN` → after outlier-excluded polyfit
- `LAPVAR_GRAIN` → after FuelCorrLapTime-based LapVariance

Do NOT train until recalibration is committed and `build_labels.py` re-run.

---

## Goal

Train two XGBoost classifiers from raw telemetry features:

1. **Severity classifier** — `DegSeverity` (0–3), ordinal multi-class
2. **Mode classifier** — `FailureMode` (none / wear / thermal), 3-class

Both models predict degradation state from corner load, thermal proxy, and
stint-progression signals — *not* from the summary statistics that generated
the labels. Graining and blistering (2 samples each) are too sparse to
classify; they fall back to the existing rule-based annotations from
`build_labels.py`.

---

## Data Flow

**Input:** `data/labeled_table.csv`

### Severity classifier — 81 rows
- Drop `DegSeverity == -1` (unreliable)

### Mode classifier — 77 rows
- Drop `DegSeverity == -1` (unreliable)
- Drop rows where `FailureMode` is `graining` or `blistering` (2 each — too sparse)
- Remaining classes: `none` (43), `wear` (24), `thermal` (10)

---

## Feature Exclusions

Same exclusion policy applied to both classifiers:

| Category | Columns | Reason |
|---|---|---|
| Housekeeping | `Driver`, `DriverNumber`, `Team`, `TrackStatus`, `IsAccurate`, `OutLap`, `InLap`, `PitOut`, `Year`, `LapTime`, `Sector1Time`, `Sector2Time`, `Sector3Time` | Not tire state signals |
| Severity label-generators | `LapDelta`, `RollingDelta3`, `DegRateAccel` | Direct leakage into DegSeverity labels |
| Mode label-generators | `ThermalAccumProxy`, `PushRecoveryDelta` | Directly used to assign thermal labels |
| Targets | `DegSeverity`, `FailureMode`, `StintId` | Targets, not features |

`SLEI`, `EarlyStintConcavity`, and `LapVariance` are **kept** — they were used
to generate graining/blistering labels, but those rows are excluded from the
mode classifier so there is no leakage into the remaining three classes.

Exact feature count determined at runtime and saved to `models/feature_list.json`
(shared by both classifiers — same input schema).

---

## Cross-Validation: Driver Leave-One-Out (both classifiers)

```
Fold 1: train = NOR laps,  test = RIC laps
Fold 2: train = RIC laps,  test = NOR laps
```

Metrics averaged across both folds. Tests the domain question: *does the model
generalise from one McLaren driver to another at the same race?*

Leave-one-year-out CV is planned for Phase 5 when multi-year data is ingested.

---

## XGBoost Configuration

Same hyperparameters applied to both classifiers:

| Parameter | Value | Rationale |
|---|---|---|
| `objective` | `multi:softprob` | Per-class probability output |
| `num_class` | 4 (severity) / 3 (mode) | Classes per target |
| `n_estimators` | 500 | Ceiling; early stopping limits actual trees |
| `early_stopping_rounds` | 30 | Stop when LOO test loss plateaus |
| `eval_metric` | `mlogloss` | Standard multi-class log-loss |
| `max_depth` | 4 | Shallow — guards overfitting on ~41 train rows |
| `learning_rate` | 0.05 | Slow; rely on early stopping |
| `subsample` | 0.8 | Row sampling per tree |
| `colsample_bytree` | 0.8 | Feature sampling per tree |
| `random_state` | 42 | Reproducibility |

**Final models:** After CV metric reporting, each classifier is refit once on its
full training set. `n_estimators` = average of the two folds' best early-stopping
iterations (rounded up). No eval set for the final fit.

No hyperparameter tuning — signal is too noisy on 2-fold LOO with ~41 train rows.
Revisit when multi-year data is available.

---

## Evaluation Metrics

Reported per fold and averaged, for each classifier independently:

| Metric | Rationale |
|---|---|
| Weighted F1 | Primary — handles class imbalance |
| Per-class precision / recall | Shows which classes struggle |
| Confusion matrix | Checks for systematic misclassification |
| Best iteration (per fold) | Informs final `n_estimators` |

Accuracy and AUC not reported.

---

## Saved Artifacts

Directory: `models/` (added to `.gitignore`)

| File | Format | Contents |
|---|---|---|
| `models/severity_model.ubj` | XGBoost native binary | Severity classifier (DegSeverity 0–3) |
| `models/mode_model.ubj` | XGBoost native binary | Mode classifier (none/wear/thermal) |
| `models/feature_list.json` | JSON array | Ordered feature columns (shared input schema) |
| `models/cv_results.json` | JSON object | Per-fold + averaged metrics for both classifiers |

---

## Public Interface

```python
def load_severity_model() -> tuple[xgb.Booster, list[str]]:
    """Return (severity_model, feature_list) for use by app.py and evaluate.py."""

def load_mode_model() -> tuple[xgb.Booster, list[str]]:
    """Return (mode_model, feature_list) for use by app.py and evaluate.py."""
```

Phase 5 (`evaluate.py`) and Phase 6 (`app.py`) import only these two functions.

---

## FailureMode Handling Summary

| Mode | Samples | Treatment |
|---|---|---|
| none | 43 | Trained in mode classifier |
| wear | 24 | Trained in mode classifier |
| thermal | 10 | Trained in mode classifier |
| graining | 2 | Rule-based fallback from `build_labels.py` |
| blistering | 2 | Rule-based fallback from `build_labels.py` |
| unreliable | 1 | Excluded entirely |

Portfolio narrative: *"The model handles the three statistically learnable
degradation modes; rare modes (graining, blistering) are flagged by domain
heuristics until more race data is ingested."*

---

## Design Constraints (inherited from HANDOFF.md)

- No exact tire wear percentages or temperatures — proxies only
- No deep learning — XGBoost only for v1
- All outputs probabilistic (per-class softmax probabilities)
- Scope: McLaren + Silverstone only
- Label methodology documented as heuristic, not physical ground truth

---

## What This Phase Does NOT Cover

- SHAP explainability → Phase 5 (`evaluate.py`)
- Streamlit dashboard → Phase 6 (`app.py`)
- Hyperparameter tuning → Phase 5+ when multi-year data exists
- Leave-one-year-out CV → Phase 5+ when multi-year data exists
