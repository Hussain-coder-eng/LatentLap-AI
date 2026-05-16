import json
import math
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xgboost as xgb

from train_model import (
    select_features,
    driver_loo_splits,
    run_loo_cv,
    train_final,
    save_artifacts,
    load_severity_model,
    load_mode_model,
    MODE_ENCODING,
)


# ── Synthetic dataframe for unit tests ───────────────────────────────────────

def _make_df(n: int = 20, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    half = n // 2
    return pd.DataFrame({
        # String cols — auto-excluded (not numeric)
        "Driver":        ["NOR"] * half + ["RIC"] * (n - half),
        "Compound":      ["MEDIUM"] * n,
        "Team":          ["McLaren"] * n,
        "FailureMode":   ["none"] * n,
        # Numeric identifiers — must be excluded
        "DriverNumber":  [4] * half + [3] * (n - half),
        "Year":          [2022] * n,
        "Stint":         [2.0] * half + [3.0] * (n - half),
        # Admin flags stored as int — must be excluded
        "TrackStatus":   [1] * n,
        "IsAccurate":    [1] * n,
        "OutLap":        [0] * n,
        "InLap":         [0] * n,
        # Seconds versions of string raw times — must be excluded
        "LapTimeSec":    rng.uniform(80, 90, n).tolist(),
        "S1Sec":         rng.uniform(20, 30, n).tolist(),
        "S2Sec":         rng.uniform(30, 40, n).tolist(),
        "S3Sec":         rng.uniform(20, 30, n).tolist(),
        # Fuel-corrected time — reconstructs LapDelta, must be excluded
        "FuelCorrLapTime": rng.uniform(80, 90, n).tolist(),
        # Severity label-generators — must be excluded
        "LapDelta":      rng.uniform(0, 2, n).tolist(),
        "RollingDelta3": rng.uniform(0, 1, n).tolist(),
        "DegRateAccel":  rng.uniform(0, 2, n).tolist(),
        "DeltaRate":     rng.uniform(-1, 1, n).tolist(),
        "S2Delta":       rng.uniform(0, 1, n).tolist(),
        "S3_S1_Decay":   rng.uniform(0, 1, n).tolist(),
        "S3_S1_DecayZ":  rng.uniform(-2, 2, n).tolist(),
        # Mode label-generators — must be excluded
        "ThermalAccumProxy": rng.uniform(0, 0.02, n).tolist(),
        "PushRecoveryDelta": rng.uniform(-0.5, 0.5, n).tolist(),
        # Targets — must be excluded
        "DegSeverity":   rng.integers(0, 4, n).tolist(),
        "StintId":       rng.integers(0, 3, n).tolist(),
        # Legitimate features — must be KEPT
        "LapNumber":     list(range(1, n + 1)),
        "TyreLife":      rng.integers(1, 30, n).tolist(),
        "Position":      rng.integers(1, 20, n).tolist(),
        "CompoundCode":  [1] * n,
        "SpeedI1":       rng.uniform(200, 300, n).tolist(),
        "MB_PeakLatG":   rng.uniform(3, 5, n).tolist(),
        "SLEI":          rng.uniform(0, 5, n).tolist(),
        "PostSC_Lap":    [0] * n,
        "TrackTemp":     rng.uniform(30, 50, n).tolist(),
        "FreshTyre":     rng.integers(0, 2, n).tolist(),
        "FuelEstKg":     rng.uniform(0, 110, n).tolist(),
    })


MUST_EXCLUDE = {
    "DriverNumber", "Year", "TrackStatus", "IsAccurate", "OutLap", "InLap",
    "LapTimeSec", "S1Sec", "S2Sec", "S3Sec", "FuelCorrLapTime",
    "LapDelta", "RollingDelta3", "DegRateAccel",
    "DeltaRate", "S2Delta", "S3_S1_Decay", "S3_S1_DecayZ",
    "ThermalAccumProxy", "PushRecoveryDelta",
    "DegSeverity", "StintId",
    "Stint",   # FastF1 race-stint counter — race-order identifier, not tire signal
}

MUST_KEEP = {
    "LapNumber", "TyreLife", "Position", "CompoundCode",
    "SpeedI1", "MB_PeakLatG", "SLEI", "PostSC_Lap",
    "TrackTemp", "FreshTyre", "FuelEstKg",
}


# ── select_features tests ─────────────────────────────────────────────────────

def test_excluded_numeric_cols_not_in_features():
    df = _make_df()
    features = select_features(df)
    for col in MUST_EXCLUDE:
        if col in df.columns:
            assert col not in features, f"'{col}' should be excluded"


def test_string_cols_not_in_features():
    df = _make_df()
    features = select_features(df)
    for col in ["Driver", "Compound", "Team", "FailureMode"]:
        assert col not in features, f"string col '{col}' must not appear in features"


def test_kept_cols_in_features():
    df = _make_df()
    features = select_features(df)
    for col in MUST_KEEP:
        assert col in features, f"'{col}' should be kept as a feature"


def test_feature_list_is_sorted():
    df = _make_df()
    features = select_features(df)
    assert features == sorted(features)


def test_all_returned_cols_are_numeric():
    df = _make_df()
    features = select_features(df)
    for col in features:
        assert pd.api.types.is_numeric_dtype(df[col]), f"'{col}' is not numeric"


# ── driver_loo_splits tests ───────────────────────────────────────────────────

def test_driver_loo_produces_two_folds():
    df = _make_df()
    folds = driver_loo_splits(df)
    assert len(folds) == 2


def test_driver_loo_non_overlapping():
    df = _make_df()
    for train_idx, test_idx, _ in driver_loo_splits(df):
        assert set(train_idx).isdisjoint(set(test_idx))


def test_driver_loo_covers_all_rows():
    df = _make_df()
    all_test = set()
    for _, test_idx, _ in driver_loo_splits(df):
        all_test.update(test_idx)
    assert all_test == set(df.index)


# ── run_loo_cv tests ──────────────────────────────────────────────────────────

def _mini_cv_df(num_class: int = 4, seed: int = 42) -> tuple[pd.DataFrame, list[str]]:
    rng = np.random.default_rng(seed)
    n = 40
    df = pd.DataFrame({
        "Driver":  ["NOR"] * 20 + ["RIC"] * 20,
        "feat_a":  rng.uniform(0, 1, n),
        "feat_b":  rng.uniform(0, 1, n),
        "feat_c":  rng.uniform(0, 1, n),
        "target":  rng.integers(0, num_class, n),
    })
    return df, ["feat_a", "feat_b", "feat_c"]


def test_run_loo_cv_probs_sum_to_one():
    df, features = _mini_cv_df(num_class=4)
    results = run_loo_cv(df, features=features, target_col="target", num_class=4)
    for fold in results["folds"]:
        probs = np.array(fold["test_probs"])
        np.testing.assert_allclose(probs.sum(axis=1), 1.0, atol=1e-5)


def test_run_loo_cv_returns_two_folds():
    df, features = _mini_cv_df()
    results = run_loo_cv(df, features=features, target_col="target", num_class=4)
    assert len(results["folds"]) == 2


def test_run_loo_cv_has_avg_metrics():
    df, features = _mini_cv_df()
    results = run_loo_cv(df, features=features, target_col="target", num_class=4)
    assert "avg_weighted_f1" in results
    assert "avg_best_iteration" in results
    assert 0.0 <= results["avg_weighted_f1"] <= 1.0


# ── train_final + save/load roundtrip test ───────────────────────────────────

def test_save_load_severity_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr("train_model.MODELS_DIR",         tmp_path)
    monkeypatch.setattr("train_model.SEVERITY_MODEL_PATH", tmp_path / "severity_model.ubj")
    monkeypatch.setattr("train_model.MODE_MODEL_PATH",     tmp_path / "mode_model.ubj")
    monkeypatch.setattr("train_model.FEATURE_LIST_PATH",   tmp_path / "feature_list.json")
    monkeypatch.setattr("train_model.CV_RESULTS_PATH",     tmp_path / "cv_results.json")

    rng = np.random.default_rng(7)
    n = 40
    df = pd.DataFrame({
        "Driver":  ["NOR"] * 20 + ["RIC"] * 20,
        "feat_x":  rng.uniform(0, 1, n),
        "feat_y":  rng.uniform(0, 1, n),
        "target":  rng.integers(0, 4, n),
    })
    features = ["feat_x", "feat_y"]
    cv = run_loo_cv(df, features=features, target_col="target", num_class=4)
    sev_model = train_final(df, features=features, target_col="target",
                            num_class=4, avg_best_iteration=cv["avg_best_iteration"])
    mode_model = train_final(df, features=features, target_col="target",
                             num_class=4, avg_best_iteration=cv["avg_best_iteration"])
    save_artifacts(sev_model, mode_model, features, {"severity": {}, "mode": {}})

    loaded_sev, loaded_feats = load_severity_model()
    assert loaded_feats == features
    probs = loaded_sev.predict_proba(df[features].values)
    assert probs.shape == (n, 4)
    np.testing.assert_allclose(probs.sum(axis=1), 1.0, atol=1e-5)


def test_mode_encoding_covers_expected_classes():
    assert set(MODE_ENCODING.keys()) == {"none", "thermal", "wear", "blistering"}
    assert sorted(MODE_ENCODING.values()) == [0, 1, 2, 3]
