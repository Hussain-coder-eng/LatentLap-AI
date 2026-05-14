#!/usr/bin/env python3
"""
Phase 4 — XGBoost Tire Degradation Classifiers

Trains two classifiers from raw telemetry features:
  severity_model : DegSeverity (0–3, ordinal)
  mode_model     : FailureMode (none / thermal / wear)

Labels are heuristic proxy approximations, not physical measurements.
Run build_feature_table.py + build_labels.py before training.
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import classification_report, confusion_matrix, f1_score

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_PATH           = "data/labeled_table.csv"
MODELS_DIR          = Path("models")
SEVERITY_MODEL_PATH = MODELS_DIR / "severity_model.ubj"
MODE_MODEL_PATH     = MODELS_DIR / "mode_model.ubj"
FEATURE_LIST_PATH   = MODELS_DIR / "feature_list.json"
CV_RESULTS_PATH     = MODELS_DIR / "cv_results.json"

# ── Mode label encoding (alphabetical → integer for XGBoost) ──────────────────
MODE_CLASSES  = ["none", "thermal", "wear"]   # none=0, thermal=1, wear=2
MODE_ENCODING = {c: i for i, c in enumerate(sorted(MODE_CLASSES))}
MODE_DECODING = {i: c for c, i in MODE_ENCODING.items()}

# ── Numeric columns to exclude from features ──────────────────────────────────
# String columns (Driver, Compound, Team, FailureMode, LapTime, Sector*Time)
# are auto-excluded by the is_numeric_dtype filter — no explicit listing needed.

_EXCLUDE_IDENTIFIERS = {
    "DriverNumber", "Year",
}
_EXCLUDE_ADMIN_FLAGS = {
    # Constant after the pipeline's IsAccurate + OutLap filters
    "TrackStatus", "IsAccurate", "OutLap", "InLap",
}
_EXCLUDE_RAW_TIMES = {
    # Seconds versions of the string LapTime / Sector*Time columns
    "LapTimeSec", "S1Sec", "S2Sec", "S3Sec",
    # FuelCorrLapTime: LapDelta = FuelCorrLapTime - stint_best, so including
    # this would let the model reconstruct the excluded LapDelta.
    "FuelCorrLapTime",
}
_EXCLUDE_SEVERITY_GENERATORS = {
    # Directly used to assign DegSeverity labels in build_labels.py
    "LapDelta", "RollingDelta3", "DegRateAccel",
    # Derived from excluded LapDelta / sector times
    "DeltaRate", "S2Delta", "S3_S1_Decay", "S3_S1_DecayZ",
}
_EXCLUDE_MODE_GENERATORS = {
    # Directly used to assign thermal FailureMode labels in build_labels.py
    "ThermalAccumProxy", "PushRecoveryDelta",
}
_EXCLUDE_TARGETS = {
    "DegSeverity", "StintId",
}

_ALL_EXCLUDED = (
    _EXCLUDE_IDENTIFIERS
    | _EXCLUDE_ADMIN_FLAGS
    | _EXCLUDE_RAW_TIMES
    | _EXCLUDE_SEVERITY_GENERATORS
    | _EXCLUDE_MODE_GENERATORS
    | _EXCLUDE_TARGETS
)


def select_features(df: pd.DataFrame) -> list[str]:
    """Return sorted list of numeric feature columns, excluding all label-leaking columns."""
    return sorted(
        c for c in df.columns
        if c not in _ALL_EXCLUDED and pd.api.types.is_numeric_dtype(df[c])
    )


# ── Stubs — implemented in Tasks 9–11 ─────────────────────────────────────────

def driver_loo_splits(df: pd.DataFrame) -> list[tuple[list[int], list[int], str]]:
    """
    Return one (train_indices, test_indices, test_driver) tuple per driver.
    Train = all rows from other drivers; test = all rows from this driver.
    """
    folds = []
    for driver in sorted(df["Driver"].unique()):
        is_test = df["Driver"] == driver
        folds.append((
            df.index[~is_test].tolist(),
            df.index[is_test].tolist(),
            driver,
        ))
    return folds


def _xgb_params(num_class: int) -> dict:
    """Fixed hyperparameters. No tuning — signal is too noisy on ~41-row LOO folds."""
    return dict(
        objective="multi:softprob",
        num_class=num_class,
        n_estimators=500,
        early_stopping_rounds=30,
        eval_metric="mlogloss",
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbosity=0,
    )


def run_loo_cv(
    df: pd.DataFrame,
    *,
    features: list[str],
    target_col: str,
    num_class: int,
    **kwargs,
) -> dict:
    """
    Driver leave-one-out CV. Returns per-fold metrics and averages.

    Return shape
    ------------
    {
      "folds": [
        {
          "test_driver":      str,
          "best_iteration":   int,
          "weighted_f1":      float,
          "report":           str,
          "confusion_matrix": list[list[int]],
          "test_probs":       list[list[float]],
          "test_true":        list[int],
        },
        ...
      ],
      "avg_weighted_f1":    float,
      "avg_best_iteration": float,
    }
    """
    folds_out = []
    for train_idx, test_idx, test_driver in driver_loo_splits(df):
        X_train = df.loc[train_idx, features].values
        y_train = df.loc[train_idx, target_col].values
        X_test  = df.loc[test_idx,  features].values
        y_test  = df.loc[test_idx,  target_col].values

        model = xgb.XGBClassifier(**_xgb_params(num_class))
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

        probs = model.predict_proba(X_test)
        preds = probs.argmax(axis=1)

        folds_out.append({
            "test_driver":      test_driver,
            "best_iteration":   int(model.best_iteration),
            "weighted_f1":      float(f1_score(y_test, preds, average="weighted", zero_division=0)),
            "report":           classification_report(y_test, preds, zero_division=0),
            "confusion_matrix": confusion_matrix(y_test, preds).tolist(),
            "test_probs":       probs.tolist(),
            "test_true":        y_test.tolist(),
        })

    return {
        "folds":              folds_out,
        "avg_weighted_f1":    float(np.mean([f["weighted_f1"]    for f in folds_out])),
        "avg_best_iteration": float(np.mean([f["best_iteration"] for f in folds_out])),
    }


def train_final(
    df: pd.DataFrame,
    *,
    features: list[str],
    target_col: str,
    num_class: int,
    avg_best_iteration: float,
) -> xgb.XGBClassifier:
    """
    Refit on the full dataset using n_estimators = ceil(avg_best_iteration).
    No eval_set — this is the production artifact.
    """
    n_trees = max(math.ceil(avg_best_iteration), 10)
    params = _xgb_params(num_class)
    params.pop("early_stopping_rounds")
    params["n_estimators"] = n_trees

    model = xgb.XGBClassifier(**params)
    model.fit(df[features].values, df[target_col].values, verbose=False)
    return model


def save_artifacts(
    severity_model: xgb.XGBClassifier,
    mode_model: xgb.XGBClassifier,
    features: list[str],
    cv_results: dict,
) -> None:
    """Persist all four model artifacts to models/."""
    MODELS_DIR.mkdir(exist_ok=True)
    severity_model.save_model(str(SEVERITY_MODEL_PATH))
    mode_model.save_model(str(MODE_MODEL_PATH))
    FEATURE_LIST_PATH.write_text(json.dumps(features, indent=2))
    CV_RESULTS_PATH.write_text(json.dumps(cv_results, indent=2))
    print(f"Saved: {SEVERITY_MODEL_PATH}, {MODE_MODEL_PATH}, "
          f"{FEATURE_LIST_PATH}, {CV_RESULTS_PATH}")


def load_severity_model() -> tuple[xgb.XGBClassifier, list[str]]:
    """Return (severity_model, feature_list) for evaluate.py and app.py."""
    model = xgb.XGBClassifier()
    model.load_model(str(SEVERITY_MODEL_PATH))
    return model, json.loads(FEATURE_LIST_PATH.read_text())


def load_mode_model() -> tuple[xgb.XGBClassifier, list[str]]:
    """Return (mode_model, feature_list) for evaluate.py and app.py."""
    model = xgb.XGBClassifier()
    model.load_model(str(MODE_MODEL_PATH))
    return model, json.loads(FEATURE_LIST_PATH.read_text())


def main() -> None:
    df_all = pd.read_csv(DATA_PATH)
    features = select_features(df_all)
    print(f"\nFeatures selected: {len(features)}")
    print(f"Feature list (first 10): {features[:10]}")

    # ── Severity classifier ────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("SEVERITY CLASSIFIER  (DegSeverity 0–3)")
    print("=" * 60)
    df_sev = df_all[df_all["DegSeverity"] != -1].copy().reset_index(drop=True)
    print(f"Training rows: {len(df_sev)}")
    print(f"Class dist: {df_sev['DegSeverity'].value_counts().sort_index().to_dict()}")

    sev_cv = run_loo_cv(df_sev, features=features, target_col="DegSeverity", num_class=4)
    for fold in sev_cv["folds"]:
        print(f"\n  Fold — test={fold['test_driver']}  "
              f"best_iter={fold['best_iteration']}  "
              f"weighted_F1={fold['weighted_f1']:.3f}")
        print(fold["report"])
        print("  Confusion matrix:\n", np.array(fold["confusion_matrix"]))
    print(f"\nSeverity avg weighted-F1 : {sev_cv['avg_weighted_f1']:.3f}")
    print(f"Severity avg best_iter   : {sev_cv['avg_best_iteration']:.1f}")

    sev_model = train_final(
        df_sev, features=features, target_col="DegSeverity",
        num_class=4, avg_best_iteration=sev_cv["avg_best_iteration"],
    )

    # ── Mode classifier ────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("MODE CLASSIFIER  (FailureMode: none / thermal / wear)")
    print("=" * 60)
    df_mode = df_all[
        (df_all["DegSeverity"] != -1) &
        (~df_all["FailureMode"].isin(["graining", "blistering", "unreliable"]))
    ].copy().reset_index(drop=True)
    df_mode["ModeLabel"] = df_mode["FailureMode"].map(MODE_ENCODING)
    print(f"Training rows: {len(df_mode)}")
    print(f"Class dist: {df_mode['FailureMode'].value_counts().to_dict()}")
    print(f"Encoding: {MODE_ENCODING}")

    mode_cv = run_loo_cv(df_mode, features=features, target_col="ModeLabel", num_class=3)
    for fold in mode_cv["folds"]:
        print(f"\n  Fold — test={fold['test_driver']}  "
              f"best_iter={fold['best_iteration']}  "
              f"weighted_F1={fold['weighted_f1']:.3f}")
        print(fold["report"])
        print("  Confusion matrix (rows/cols: none=0, thermal=1, wear=2):\n",
              np.array(fold["confusion_matrix"]))
    print(f"\nMode avg weighted-F1 : {mode_cv['avg_weighted_f1']:.3f}")
    print(f"Mode avg best_iter   : {mode_cv['avg_best_iteration']:.1f}")

    mode_model = train_final(
        df_mode, features=features, target_col="ModeLabel",
        num_class=3, avg_best_iteration=mode_cv["avg_best_iteration"],
    )

    # ── Save artifacts ─────────────────────────────────────────────────────────
    cv_results = {
        "severity": {k: v for k, v in sev_cv.items()  if k != "folds"},
        "mode":     {k: v for k, v in mode_cv.items() if k != "folds"},
        "mode_encoding": MODE_ENCODING,
        "severity_folds": [
            {k: v for k, v in f.items() if k != "test_probs"} for f in sev_cv["folds"]
        ],
        "mode_folds": [
            {k: v for k, v in f.items() if k != "test_probs"} for f in mode_cv["folds"]
        ],
    }
    save_artifacts(sev_model, mode_model, features, cv_results)
    print("\nPhase 4 complete.")


if __name__ == "__main__":
    main()
