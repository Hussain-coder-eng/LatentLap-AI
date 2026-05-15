import pandas as pd

from build_labels import SLEI_BLISTER, assign_failure_mode, assign_stints


def test_slei_blister_threshold():
    assert 30.0 <= SLEI_BLISTER <= 100.0


def test_assign_stints_uses_fastf1_stint():
    df = pd.DataFrame({
        "Year": [2022, 2022, 2022, 2022],
        "Driver": ["NOR", "NOR", "NOR", "NOR"],
        "Stint": [1, 1, 2, 2],
        "TyreLife": [1, 2, 1, 2],
        "LapNumber": [1, 2, 3, 4],
    })

    out = assign_stints(df)

    assert out["StintId"].tolist() == [0, 0, 1, 1]


def test_assign_stints_sc_gap_no_merge():
    df = pd.DataFrame({
        "Year": [2022, 2022, 2022, 2022],
        "Driver": ["NOR", "NOR", "NOR", "NOR"],
        "Stint": [1, 1, 2, 2],
        "TyreLife": [1, 2, 3, 4],
        "LapNumber": [1, 2, 5, 6],
    })

    out = assign_stints(df)

    assert out.loc[out["Stint"] == 1, "StintId"].tolist() == [0, 0]
    assert out.loc[out["Stint"] == 2, "StintId"].tolist() == [1, 1]


def test_assign_stints_nan_stint_no_crash():
    df = pd.DataFrame({
        "Year": [2022, 2022, 2022],
        "Driver": ["NOR", "NOR", "NOR"],
        "Stint": [1.0, float("nan"), 2.0],
        "TyreLife": [1, 2, 1],
        "LapNumber": [1, 2, 3],
    })
    out = assign_stints(df)
    assert out["StintId"].notna().all()
    assert out["StintId"].dtype in [int, "int64", "int32"]


def test_blistering_fires_at_slei_above_threshold():
    df = pd.DataFrame({
        "SLEI": [35.0],
        "LapDelta": [0.5],
        "TyreLife": [5],
        "PushRecoveryDelta": [0.0],
        "EarlyStintConcavity": [0.0],
        "LapVariance": [0.0],
        "DegRateAccel": [0.0],
        "ThermalAccumProxy": [0.0],
        "DegSeverity": [2],
    })

    out = assign_failure_mode(df)

    assert out.loc[0, "FailureMode"] == "blistering"
