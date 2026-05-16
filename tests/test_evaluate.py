import numpy as np
import pandas as pd
import pytest
import xgboost as xgb

# -- Synthetic test helpers ----------------------------------------------------

_TEST_FEATURES = [
    "AirTemp", "TrackTemp", "TyreLife", "LapNumber",
    "AggressionZ", "MB_PeakLatG", "MB_TimeSec",
    "Copse_PeakLatG", "FuelEstKg", "RollingDelta3_Z",
]


def _make_minimal_df(n: int = 30, year: int = 2022) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    half = n // 2
    drivers = ["NOR"] * half + ["RIC"] * (n - half)
    stint_ids = [0] * (half - 3) + [1] * 3 + [0] * (n - half - 3) + [1] * 3
    severity = (np.arange(n) % 4).astype(int)
    lap_delta = severity * 0.35 + rng.uniform(0, 0.05, n)
    feature_values = {
        feat: rng.uniform(0, 1, n)
        for feat in _TEST_FEATURES
        if feat not in {"TyreLife", "LapNumber"}
    }
    return pd.DataFrame({
        "Year":        [year] * n,
        "Driver":      drivers,
        "LapNumber":   list(range(1, n + 1)),
        "StintId":     stint_ids,
        "DegSeverity": severity.tolist(),
        "FailureMode": (["blistering", "none", "thermal", "wear"] * ((n // 4) + 1))[:n],
        "Compound":    ["MEDIUM"] * n,
        "TyreLife":    rng.integers(1, 30, n).tolist(),
        "LapDelta":    lap_delta.tolist(),
        **feature_values,
    })


def _train_tiny_sev_model(df: pd.DataFrame, features: list):
    df_valid = df[df["DegSeverity"] != -1]
    X = df_valid[features].values
    y = df_valid["DegSeverity"].values
    model = xgb.XGBClassifier(
        n_estimators=5,
        max_depth=2,
        num_class=4,
        objective="multi:softprob",
        eval_metric="mlogloss",
        random_state=0,
        verbosity=0,
    )
    model.fit(X, y)
    return model


def _train_tiny_mode_model(df: pd.DataFrame, features: list):
    df_valid = df[df["DegSeverity"] != -1]
    X = df_valid[features].values
    # 4-class encoding: blistering=0, none=1, thermal=2, wear=3 (alphabetical)
    mode_enc = {"blistering": 0, "none": 1, "thermal": 2, "wear": 3}
    y = np.array([mode_enc.get(m, 1) for m in df_valid["FailureMode"]])
    model = xgb.XGBClassifier(
        n_estimators=5,
        max_depth=2,
        num_class=4,
        objective="multi:softprob",
        eval_metric="mlogloss",
        random_state=0,
        verbosity=0,
    )
    model.fit(X, y)
    return model


@pytest.fixture
def sample_data():
    df = _make_minimal_df(n=30)
    features = _TEST_FEATURES
    sev_model = _train_tiny_sev_model(df, features)
    mode_model = _train_tiny_mode_model(df, features)
    return df, sev_model, mode_model, features


# -- Tests ---------------------------------------------------------------------

def test_compute_predictions_schema(sample_data):
    from evaluate import compute_predictions
    df, sev_model, mode_model, features = sample_data
    result = compute_predictions(df, sev_model, mode_model, features)
    assert "meta" in result and "laps" in result
    assert len(result["laps"]) > 0
    lap = result["laps"][0]
    assert "key" in lap
    assert len(lap["severity_probs"]) == 4
    assert set(lap["mode_probs"].keys()) == {"blistering", "none", "thermal", "wear"}
    assert "track_progress" in lap


def test_shap_data_keys_match_predictions(sample_data):
    from evaluate import compute_predictions, compute_shap
    df, sev_model, mode_model, features = sample_data
    predictions = compute_predictions(df, sev_model, mode_model, features)
    shap_data = compute_shap(df, sev_model, mode_model, features, predictions)
    pred_keys = {lap["key"] for lap in predictions["laps"]}
    shap_keys = set(shap_data["shap_values"]["severity"].keys())
    assert pred_keys == shap_keys


def test_pit_timing_hit_rate_in_range(sample_data):
    from evaluate import compute_predictions, validate_pit_timing
    df, sev_model, mode_model, features = sample_data
    predictions = compute_predictions(df, sev_model, mode_model, features)
    result = validate_pit_timing(df, predictions)
    assert 0.0 <= result["hit_rate"] <= 1.0
    assert isinstance(result["pass"], bool)


def test_spearman_values_bounded(sample_data):
    from evaluate import compute_predictions, validate_spearman
    df, sev_model, mode_model, features = sample_data
    predictions = compute_predictions(df, sev_model, mode_model, features)
    result = validate_spearman(df, predictions)
    for stint in result["all_stints"]:
        assert -1.0 <= stint["rho"] <= 1.0


def test_html_report_exists_and_nonzero(sample_data, tmp_path):
    from evaluate import compute_predictions, compute_shap, validate_pit_timing, validate_spearman, validate_oos_2024, build_html_report
    df, sev_model, mode_model, features = sample_data
    predictions = compute_predictions(df, sev_model, mode_model, features)
    shap_data = compute_shap(df, sev_model, mode_model, features, predictions)
    val_pit = validate_pit_timing(df, predictions)
    val_spear = validate_spearman(df, predictions)
    val_oos = validate_oos_2024(df, sev_model, features)
    html = build_html_report(df, predictions, shap_data, val_pit, val_spear, val_oos, features)
    out = tmp_path / "test_report.html"
    out.write_text(html, encoding="utf-8")
    assert out.exists()
    assert out.stat().st_size > 10_240   # > 10 KB


def test_track_progress_bounded(sample_data):
    from evaluate import compute_predictions
    df, sev_model, mode_model, features = sample_data
    result = compute_predictions(df, sev_model, mode_model, features)
    for lap in result["laps"]:
        assert 0.0 <= lap["track_progress"] < 1.0
