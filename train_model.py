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

def driver_loo_splits(df: pd.DataFrame) -> list[tuple]:
    raise NotImplementedError("Task 9")


def run_loo_cv(df: pd.DataFrame, *, features: list[str], target_col: str, num_class: int, **kwargs) -> dict:
    raise NotImplementedError("Task 10")


def train_final(df: pd.DataFrame, *, features: list[str], target_col: str, num_class: int, avg_best_iteration: float) -> xgb.Booster:
    raise NotImplementedError("Task 11")


def save_artifacts(severity_model: xgb.Booster, mode_model: xgb.Booster, features: list[str], cv_results: dict) -> None:
    raise NotImplementedError("Task 11")


def load_severity_model() -> tuple:
    raise NotImplementedError("Task 11")


def load_mode_model() -> tuple:
    raise NotImplementedError("Task 11")
