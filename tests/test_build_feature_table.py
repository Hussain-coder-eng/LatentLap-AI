import warnings

import numpy as np
import pandas as pd

from build_feature_table import club_exit_throttle, rolling_slei_max, pit_and_compound_features


def _pit_laps():
    """Minimal 3-lap DataFrame: lap1 = in-lap, lap2 = out-lap, lap3 = normal."""
    return pd.DataFrame({
        "Driver":     ["NOR", "NOR", "NOR"],
        "LapNumber":  [10, 11, 12],
        "Stint":      [1, 2, 2],
        "Compound":   ["MEDIUM", "HARD", "HARD"],
        "TyreLife":   [10, 1, 2],
        "PitInTime":  [pd.Timestamp("2022-07-03 14:30:00"), pd.NaT, pd.NaT],
        "PitOutTime": [pd.NaT, pd.Timestamp("2022-07-03 14:30:27"), pd.NaT],
    })


def test_club_exit_throttle_nan_when_all_low():
    dist = np.array([4190.0, 4300.0, 4500.0, 4710.0])
    throttle = np.array([20.0, 30.0, 50.0, 40.0])

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", RuntimeWarning)
        exit_throttle = club_exit_throttle(dist, throttle, 4200.0, 4700.0)

    assert np.isnan(exit_throttle)
    assert not caught


def test_club_exit_throttle_correct_mean():
    dist = np.array([4190.0, 4300.0, 4500.0, 4710.0])
    throttle = np.array([30.0, 60.0, 70.0, 40.0])

    assert club_exit_throttle(dist, throttle, 4200.0, 4700.0) == 65.0


def test_slei_rolling_beats_chunked():
    lat_g_sq_v = np.array([0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, 0, 0], dtype=float)
    dt_sec = np.full_like(lat_g_sq_v, 0.1)
    window_samples = 5

    rolling = rolling_slei_max(lat_g_sq_v, dt_sec, window_samples, step=1)
    chunked = rolling_slei_max(lat_g_sq_v, dt_sec, window_samples, step=window_samples)

    assert rolling > chunked


def test_slei_rolling_includes_final_window():
    # Peak is in the LAST window - off-by-one would miss it
    lat_g_sq_v = np.array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5], dtype=float)
    dt_sec = np.full(15, 0.1)
    window_samples = 5
    slei = rolling_slei_max(lat_g_sq_v, dt_sec, window_samples, step=1)
    assert slei > 0.0, "Final window missed - off-by-one bug present"


def test_pit_stop_duration_on_outlap():
    df = pit_and_compound_features(_pit_laps())
    out_idx = df[df["LapNumber"] == 11].index[0]
    assert abs(df.loc[out_idx, "PitStopDuration"] - 27.0) < 0.5


def test_pit_stop_duration_nan_on_normal_lap():
    df = pit_and_compound_features(_pit_laps())
    normal_idx = df[df["LapNumber"] == 12].index[0]
    assert pd.isna(df.loc[normal_idx, "PitStopDuration"])


def test_prev_compound_first_stint_is_nan():
    df = pit_and_compound_features(_pit_laps())
    first_stint = df[df["Stint"] == 1]
    assert first_stint["PrevCompound"].isna().all()
    assert (first_stint["PrevCompoundCode"] == -1).all()


def test_prev_compound_second_stint_correct():
    df = pit_and_compound_features(_pit_laps())
    second_stint = df[df["Stint"] == 2]
    assert (second_stint["PrevCompound"] == "MEDIUM").all()
    assert (second_stint["PrevCompoundCode"] == 1).all()  # MEDIUM=1
