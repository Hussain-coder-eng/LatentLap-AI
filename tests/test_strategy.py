from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import pytest

from strategy import (
    fit_degradation_curve,
    extrapolate_finish_severity,
    tag_recommendation,
    compute_pit_window,
    score_confidence,
    build_driver_recommendation,
    generate_strategy_json,
)


# -- fit_degradation_curve -----------------------------------------------------

def test_fit_returns_three_coefficients():
    laps = list(range(1, 20))
    sevs = [0.05 * x for x in laps]
    coeffs = fit_degradation_curve(laps, sevs)
    assert len(coeffs) == 3


def test_fit_nearly_linear_data():
    laps = list(range(1, 21))
    sevs = [0.1 * x for x in laps]
    coeffs = fit_degradation_curve(laps, sevs)
    poly = np.poly1d(coeffs)
    assert abs(poly(20) - 2.0) < 0.05


def test_fit_raises_on_insufficient_data():
    with pytest.raises(ValueError, match="insufficient data"):
        fit_degradation_curve([1, 2, 3], [0.1, 0.2, 0.3])


# -- extrapolate_finish_severity -----------------------------------------------

def test_extrapolate_result_in_valid_range():
    laps = list(range(1, 30))
    sevs = [0.05 * x for x in laps]
    coeffs = fit_degradation_curve(laps, sevs)
    result = extrapolate_finish_severity(coeffs, pit_lap=18, race_laps=52, fresh_tire_baseline=0.3)
    assert 0.0 <= result <= 3.0


def test_extrapolate_earlier_pit_gives_higher_finish_severity():
    """Earlier pit => more fresh-tire laps => higher finish severity."""
    laps = list(range(1, 30))
    sevs = [0.05 * x for x in laps]
    coeffs = fit_degradation_curve(laps, sevs)
    sev_early = extrapolate_finish_severity(coeffs, pit_lap=18, race_laps=52, fresh_tire_baseline=0.3)
    sev_late  = extrapolate_finish_severity(coeffs, pit_lap=26, race_laps=52, fresh_tire_baseline=0.3)
    assert sev_early >= sev_late


def test_extrapolate_clamps_to_max():
    laps = list(range(1, 30))
    sevs = [min(3.0, 0.3 * x) for x in laps]
    coeffs = fit_degradation_curve(laps, sevs)
    result = extrapolate_finish_severity(coeffs, pit_lap=1, race_laps=52, fresh_tire_baseline=0.3)
    assert result <= 3.0


def test_extrapolate_clamps_to_min():
    laps = list(range(1, 30))
    sevs = [0.001 * x for x in laps]   # nearly flat, very low severity
    coeffs = fit_degradation_curve(laps, sevs)
    result = extrapolate_finish_severity(coeffs, pit_lap=26, race_laps=52, fresh_tire_baseline=0.3)
    assert result >= 0.0


# -- tag_recommendation --------------------------------------------------------

def test_tag_optimal():
    assert tag_recommendation(1.8, ideal_threshold=2.0, acceptable_threshold=2.5) == "optimal"


def test_tag_optimal_at_boundary():
    assert tag_recommendation(2.0, ideal_threshold=2.0, acceptable_threshold=2.5) == "optimal"


def test_tag_acceptable():
    assert tag_recommendation(2.3, ideal_threshold=2.0, acceptable_threshold=2.5) == "acceptable"


def test_tag_late():
    assert tag_recommendation(2.7, ideal_threshold=2.0, acceptable_threshold=2.5) == "late"


def test_tag_critical():
    assert tag_recommendation(3.0, ideal_threshold=2.0, acceptable_threshold=2.5) == "critical"


# -- compute_pit_window --------------------------------------------------------

def test_compute_pit_window_finds_qualifying_range():
    strategies = [
        {"pit_lap": 18, "finish_severity": 1.9},
        {"pit_lap": 20, "finish_severity": 2.0},
        {"pit_lap": 22, "finish_severity": 2.2},
        {"pit_lap": 24, "finish_severity": 2.6},
        {"pit_lap": 26, "finish_severity": 3.0},
    ]
    window = compute_pit_window(strategies, ideal_threshold=2.0)
    assert window["start"] == 18
    assert window["end"] == 20


def test_compute_pit_window_no_qualifying():
    strategies = [
        {"pit_lap": 18, "finish_severity": 2.4},
        {"pit_lap": 20, "finish_severity": 2.6},
        {"pit_lap": 22, "finish_severity": 2.8},
        {"pit_lap": 24, "finish_severity": 2.9},
        {"pit_lap": 26, "finish_severity": 3.0},
    ]
    window = compute_pit_window(strategies, ideal_threshold=2.0)
    assert window["start"] == 18
    assert window["end"] == 18


def test_compute_pit_window_all_qualify():
    strategies = [
        {"pit_lap": 18, "finish_severity": 1.5},
        {"pit_lap": 20, "finish_severity": 1.6},
        {"pit_lap": 22, "finish_severity": 1.7},
        {"pit_lap": 24, "finish_severity": 1.8},
        {"pit_lap": 26, "finish_severity": 1.9},
    ]
    window = compute_pit_window(strategies, ideal_threshold=2.0)
    assert window["start"] == 18
    assert window["end"] == 26


def test_compute_pit_window_non_consecutive_qualifying():
    """Laps 18 and 22 qualify but 20 does not.

    The window must NOT span 18-22 (which would implicitly endorse lap 20).
    The longest consecutive run is length-1, so both candidates tie; the function
    must return the first qualifying lap for both start and end.
    """
    strategies = [
        {"pit_lap": 18, "finish_severity": 1.9},   # qualifies
        {"pit_lap": 20, "finish_severity": 2.3},   # does NOT qualify
        {"pit_lap": 22, "finish_severity": 1.8},   # qualifies — non-consecutive
        {"pit_lap": 24, "finish_severity": 2.6},   # does not
        {"pit_lap": 26, "finish_severity": 3.0},   # does not
    ]
    window = compute_pit_window(strategies, ideal_threshold=2.0)
    # Longest run is exactly 1 entry; first qualifying entry is lap 18.
    assert window["start"] == 18
    assert window["end"] == 18


# -- score_confidence ----------------------------------------------------------

def test_confidence_high():
    assert score_confidence(30) == "high"


def test_confidence_high_boundary():
    assert score_confidence(35) == "high"


def test_confidence_medium():
    assert score_confidence(20) == "medium"


def test_confidence_medium_boundary():
    assert score_confidence(15) == "medium"


def test_confidence_low():
    assert score_confidence(4) == "low"


def test_confidence_low_boundary():
    assert score_confidence(14) == "low"


# -- build_driver_recommendation -----------------------------------------------

def test_build_recommendation_structure():
    lap_records = [{"lap_number": i, "severity_pred": 0.05 * i} for i in range(1, 30)]
    result = build_driver_recommendation(lap_records, current_lap=25)
    assert "current_lap" in result
    assert "current_severity" in result
    assert "pit_strategies" in result
    assert "primary_pit_window" in result
    assert "confidence" in result
    assert len(result["pit_strategies"]) == 5


def test_build_recommendation_strategy_fields():
    lap_records = [{"lap_number": i, "severity_pred": 0.05 * i} for i in range(1, 30)]
    result = build_driver_recommendation(lap_records, current_lap=25)
    for s in result["pit_strategies"]:
        assert s["pit_lap"] in [18, 20, 22, 24, 26]
        assert s["finish_severity"] is None or 0.0 <= s["finish_severity"] <= 3.0
        assert s["recommendation"] in {"optimal", "acceptable", "late", "critical"}


def test_build_recommendation_insufficient_data():
    lap_records = [{"lap_number": i, "severity_pred": 0.1 * i} for i in range(1, 4)]
    result = build_driver_recommendation(lap_records, current_lap=3)
    assert result["confidence"] == "low"
    assert result["current_severity"] is None


def test_build_recommendation_window_valid():
    lap_records = [{"lap_number": i, "severity_pred": 0.04 * i} for i in range(1, 35)]
    result = build_driver_recommendation(lap_records, current_lap=30)
    w = result["primary_pit_window"]
    assert w["start"] in [18, 20, 22, 24, 26]
    assert w["end"] in [18, 20, 22, 24, 26]
    assert w["start"] <= w["end"]


def test_build_recommendation_respects_current_lap():
    lap_records = [{"lap_number": i, "severity_pred": 0.05 * i} for i in range(1, 52)]
    result = build_driver_recommendation(lap_records, current_lap=20)
    assert result["current_lap"] == 20


# -- generate_strategy_json (integration) -------------------------------------

def _make_minimal_predictions(tmp_path: Path) -> Path:
    laps = []
    for lap_n in range(1, 53):
        for driver in ["NOR", "PIA"]:
            laps.append({
                "key":           f"2022_{driver}_{lap_n}",
                "year":          2022,
                "driver":        driver,
                "lap_number":    lap_n,
                "stint_id":      0,
                "severity_pred": round(min(3.0, 0.04 * lap_n), 4),
            })
    payload = {"meta": {"years": [2022]}, "laps": laps}
    p = tmp_path / "predictions.json"
    p.write_text(json.dumps(payload))
    return p


def test_generate_strategy_json_structure(tmp_path):
    pred_path = _make_minimal_predictions(tmp_path)
    out_path  = tmp_path / "strategy_recommendations.json"
    result = generate_strategy_json(predictions_path=pred_path, output_path=out_path)
    assert "2022" in result
    assert "NOR" in result["2022"]
    assert "PIA" in result["2022"]
    rec = result["2022"]["NOR"]
    assert rec["confidence"] in {"high", "medium", "low"}
    assert len(rec["pit_strategies"]) == 5
    assert out_path.exists()


def test_generate_strategy_json_dry_run_no_write(tmp_path):
    pred_path = _make_minimal_predictions(tmp_path)
    out_path  = tmp_path / "strategy_recommendations.json"
    generate_strategy_json(predictions_path=pred_path, output_path=out_path, dry_run=True)
    assert not out_path.exists()


def test_generate_strategy_json_year_filter(tmp_path):
    pred_path = _make_minimal_predictions(tmp_path)
    out_path  = tmp_path / "strategy_recommendations.json"
    result = generate_strategy_json(
        predictions_path=pred_path, output_path=out_path, year_filter=2022
    )
    assert list(result.keys()) == ["2022"]


def test_generate_strategy_json_missing_predictions(tmp_path):
    with pytest.raises(FileNotFoundError):
        generate_strategy_json(
            predictions_path=tmp_path / "nonexistent.json",
            output_path=tmp_path / "out.json",
        )


def test_generate_strategy_json_missing_laps_key(tmp_path):
    """predictions.json without 'laps' key must raise ValueError with a clear message."""
    p = tmp_path / "predictions.json"
    p.write_text(json.dumps({"meta": {"years": [2022]}}))
    with pytest.raises(ValueError, match="missing top-level key 'laps'"):
        generate_strategy_json(
            predictions_path=p,
            output_path=tmp_path / "out.json",
        )


def test_generate_strategy_json_malformed_record(tmp_path):
    """A record missing 'severity_pred' must raise ValueError naming the field."""
    p = tmp_path / "predictions.json"
    laps = [{"year": 2022, "driver": "NOR", "lap_number": i} for i in range(1, 10)]
    p.write_text(json.dumps({"laps": laps}))
    with pytest.raises(ValueError, match="severity_pred"):
        generate_strategy_json(
            predictions_path=p,
            output_path=tmp_path / "out.json",
        )


def test_generate_strategy_json_nan_severity_skipped(tmp_path, capsys):
    """NaN severity_pred records are skipped with a warning; clean records still produce output."""
    laps = []
    for lap_n in range(1, 53):
        sev = float("nan") if lap_n == 10 else round(min(3.0, 0.04 * lap_n), 4)
        laps.append({
            "year": 2022, "driver": "NOR",
            "lap_number": lap_n, "severity_pred": sev,
        })
    p = tmp_path / "predictions.json"
    # json.dumps emits NaN as a bare NaN literal — use allow_nan=True (default).
    p.write_text(json.dumps({"laps": laps}))
    out_path = tmp_path / "out.json"
    result = generate_strategy_json(predictions_path=p, output_path=out_path)
    captured = capsys.readouterr()
    assert "WARNING" in captured.out
    assert "NaN" in captured.out or "nan" in captured.out.lower()
    # Remaining 51 clean laps must still produce a valid recommendation.
    assert "2022" in result
    assert result["2022"]["NOR"]["confidence"] in {"high", "medium", "low"}
    # Finish severities must be real numbers, not NaN.
    for s in result["2022"]["NOR"]["pit_strategies"]:
        if s["finish_severity"] is not None:
            assert not (isinstance(s["finish_severity"], float) and np.isnan(s["finish_severity"]))
