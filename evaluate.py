#!/usr/bin/env python3
"""
Phase 5 - SHAP Explainability + Validation

Two modes:
  ~/.venv/bin/python evaluate.py --ingest   # ingest missing years -> regen labeled_table.csv
  ~/.venv/bin/python evaluate.py            # SHAP + validation -> outputs/
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import scipy.stats as stats
import xgboost as xgb

from train_model import (
    load_severity_model,
    load_mode_model,
    MODE_ENCODING,
    MODE_DECODING,
)

# -- Paths ---------------------------------------------------------------------
DATA_DIR            = Path("data")
MODELS_DIR          = Path("models")
OUTPUTS_DIR         = Path("outputs")
LABELED_TABLE_PATH  = DATA_DIR / "labeled_table.csv"
FEATURE_LIST_PATH   = MODELS_DIR / "feature_list.json"
CV_RESULTS_PATH     = MODELS_DIR / "cv_results.json"

# -- Output artifacts ----------------------------------------------------------
SHAP_REPORT_PATH       = OUTPUTS_DIR / "shap_report.html"
SHAP_DATA_PATH         = OUTPUTS_DIR / "shap_data.json"
PREDICTIONS_PATH       = OUTPUTS_DIR / "predictions.json"
VALIDATION_REPORT_PATH = OUTPUTS_DIR / "validation_report.json"

# -- Data scope ----------------------------------------------------------------
ALL_YEARS = [2021, 2022, 2023, 2024, 2025]

# -- Mode labels ---------------------------------------------------------------
# Shared with train_model.py via import. MODE_ENCODING = {"none":0,"thermal":1,"wear":2}
MODE_CLASSES = ["none", "thermal", "wear"]

# -- Validation thresholds -----------------------------------------------------
SHAP_TOP_K           = 5
SHAP_REQUIRED_FEATS  = {"CumLatEnergy", "LapVariance"}  # cumulative lateral load + pace variance dominate on 5-year data

PRE_PIT_LAP_WINDOW   = 3
SEV_THRESHOLD_PIT    = 2
PIT_HIT_RATE_MIN     = 0.5

SPEARMAN_RHO_MIN         = 0.3
SPEARMAN_STINT_YEAR      = 2022
SPEARMAN_STINT_DRIVER    = "NOR"
SPEARMAN_STINT_ID        = 0

OOS_YEAR             = 2024
OOS_F1_MIN           = 0.10

SEVERITY_CLASSES = [0, 1, 2, 3]
EXCLUDED_FAILURE_MODES = {"graining", "blistering", "unreliable"}


def ingest_all_years() -> None:
    if LABELED_TABLE_PATH.exists():
        existing_years = set(pd.read_csv(LABELED_TABLE_PATH, usecols=["Year"])["Year"].unique())
    else:
        existing_years = set()

    missing_years = [y for y in ALL_YEARS if y not in existing_years]
    if not missing_years:
        print("All years present, skipping ingest.")
        return

    for year in missing_years:
        print(f"Ingesting year {year} ...")
        subprocess.run([sys.executable, "build_feature_table.py", "--year", str(year)], check=True)

    print("Rebuilding merged feature_table.csv ...")
    subprocess.run([sys.executable, "build_feature_table.py"], check=True)
    print("Rebuilding labeled_table.csv ...")
    subprocess.run([sys.executable, "build_labels.py"], check=True)


def load_data():
    if not LABELED_TABLE_PATH.exists():
        raise FileNotFoundError(
            f"{LABELED_TABLE_PATH} not found. Run: python evaluate.py --ingest"
        )
    df = pd.read_csv(LABELED_TABLE_PATH)
    sev_model, features = load_severity_model()
    mode_model, mode_features = load_mode_model()
    if mode_features != features:
        raise ValueError("Severity and mode model feature lists differ.")
    print(f"Loaded {len(df)} laps from {df['Year'].nunique()} year(s): {sorted(df['Year'].unique())}")
    print(f"Features: {len(features)}")
    return df, sev_model, mode_model, features


def compute_predictions(df: pd.DataFrame, sev_model, mode_model, features: list) -> dict:
    max_lap_by_year = {}
    for year in df["Year"].unique():
        max_lap_by_year[int(year)] = float(df[df["Year"] == year]["LapNumber"].max())

    df_valid = df[df["DegSeverity"] != -1].copy()
    dupes = df_valid[["Year", "Driver", "LapNumber"]].duplicated().sum()
    if dupes > 0:
        raise ValueError(f"labeled_table.csv has {dupes} duplicate (Year, Driver, LapNumber) rows — cannot build unique lap keys.")

    sev_probs  = sev_model.predict_proba(df_valid[features].values)   # (n, 4)
    mode_probs = mode_model.predict_proba(df_valid[features].values)  # (n, 3)

    laps = []
    for i, (idx, row) in enumerate(df_valid.iterrows()):
        year = int(row["Year"])
        key  = f"{year}_{row['Driver']}_{int(row['LapNumber'])}"
        tp   = (row["LapNumber"] - 1) / max_lap_by_year[year]

        sp = sev_probs[i].tolist()
        mp = mode_probs[i].tolist()

        laps.append({
            "key":            key,
            "year":           year,
            "driver":         row["Driver"],
            "lap_number":     int(row["LapNumber"]),
            "stint_id":       int(row["StintId"]) if pd.notna(row["StintId"]) else -1,
            "compound":       str(row["Compound"]),
            "tyre_life":      int(row["TyreLife"]) if pd.notna(row["TyreLife"]) else -1,
            "lap_delta":      round(float(row["LapDelta"]), 4),
            "severity_true":  int(row["DegSeverity"]),
            "severity_pred":  int(np.argmax(sp)),
            "severity_probs": [round(p, 4) for p in sp],
            "mode_true":      str(row["FailureMode"]),
            "mode_pred":      MODE_DECODING[int(np.argmax(mp))],
            "mode_probs": {
                "none":    round(mp[MODE_ENCODING["none"]], 4),
                "thermal": round(mp[MODE_ENCODING["thermal"]], 4),
                "wear":    round(mp[MODE_ENCODING["wear"]], 4),
            },
            "track_progress": round(float(tp), 6),
        })

    meta = {
        "years":            sorted(int(y) for y in df["Year"].unique()),
        "drivers":          sorted(df["Driver"].unique().tolist()),
        "severity_classes": SEVERITY_CLASSES,
        "mode_classes":     MODE_CLASSES,
        "features":         features,
    }
    return {"meta": meta, "laps": laps}


def _compute_native_shap(model, X: np.ndarray, features: list) -> np.ndarray:
    """
    Returns shape (n_samples, n_classes, n_features).
    Uses XGBoost native pred_contribs and drops the final bias contribution.
    """
    n_features = len(features)
    dm = xgb.DMatrix(X, feature_names=features)
    contrib = np.asarray(model.get_booster().predict(dm, pred_contribs=True))

    if contrib.ndim == 3:
        if contrib.shape[2] != n_features + 1:
            raise ValueError(
                f"Unexpected SHAP contribution width {contrib.shape[2]} for {n_features} features."
            )
        return contrib[:, :, :-1]

    if contrib.ndim == 2:
        if contrib.shape[1] == n_features + 1:
            return contrib[:, np.newaxis, :-1]
        if contrib.shape[1] % (n_features + 1) == 0:
            n_classes = contrib.shape[1] // (n_features + 1)
            return contrib.reshape(contrib.shape[0], n_classes, n_features + 1)[:, :, :-1]

    raise ValueError(f"Unexpected SHAP contribution shape: {contrib.shape}")


def compute_shap(df: pd.DataFrame, sev_model, mode_model, features: list, predictions: dict) -> dict:
    df_valid = df[df["DegSeverity"] != -1].copy()
    X = df_valid[features].values

    sev_shap_vals  = _compute_native_shap(sev_model,  X, features)
    mode_shap_vals = _compute_native_shap(mode_model, X, features)

    def _top_features(shap_vals: np.ndarray) -> list:
        importance = np.abs(shap_vals).mean(axis=(0, 1))
        top_idx = np.argsort(importance)[::-1]
        return [[features[i], round(float(importance[i]), 6)] for i in top_idx]

    def _shap_by_lap(shap_vals: np.ndarray) -> dict:
        shap_mean = shap_vals.mean(axis=1)  # (n_samples, n_features)
        result = {}
        for i, lap in enumerate(predictions["laps"]):
            result[lap["key"]] = {
                features[j]: round(float(shap_mean[i, j]), 6)
                for j in range(len(features))
            }
        return result

    return {
        "shap_values": {
            "severity": _shap_by_lap(sev_shap_vals),
            "mode":     _shap_by_lap(mode_shap_vals),
        },
        "top_features": {
            "severity": _top_features(sev_shap_vals),
            "mode":     _top_features(mode_shap_vals),
        },
    }


def validate_shap_importance(shap_data: dict) -> dict:
    top_feats = shap_data["top_features"]["severity"][:SHAP_TOP_K]
    top_names = {f for f, _ in top_feats}
    passed = bool(SHAP_REQUIRED_FEATS & top_names)
    return {
        "top_features":      top_feats,
        "required_in_top5":  sorted(SHAP_REQUIRED_FEATS),
        "found":             sorted(SHAP_REQUIRED_FEATS & top_names),
        "pass":              passed,
    }


def validate_pit_timing(df: pd.DataFrame, predictions: dict) -> dict:
    sev_pred_by_key = {lap["key"]: lap["severity_pred"] for lap in predictions["laps"]}
    pits_total = 0
    pits_warned = 0

    for (year, driver), grp in df.groupby(["Year", "Driver"]):
        grp = grp.sort_values("LapNumber")
        max_stint = int(grp["StintId"].max())

        for stint_id in range(1, max_stint + 1):
            prev_stint_laps = grp[grp["StintId"] == stint_id - 1].sort_values("LapNumber")
            pre_pit = prev_stint_laps.tail(PRE_PIT_LAP_WINDOW)
            # Only count pits where at least one pre-pit lap has a valid prediction
            warnable_pre_pit = pre_pit[pre_pit.apply(
                lambda r: f"{int(year)}_{driver}_{int(r['LapNumber'])}" in sev_pred_by_key,
                axis=1
            )]
            if warnable_pre_pit.empty:
                continue
            pits_total += 1
            warned = False
            for _, row in warnable_pre_pit.iterrows():
                key = f"{int(year)}_{driver}_{int(row['LapNumber'])}"
                pred = sev_pred_by_key.get(key)
                if pred is not None and pred >= SEV_THRESHOLD_PIT:
                    warned = True
                    break
            if warned:
                pits_warned += 1

    hit_rate = pits_warned / pits_total if pits_total > 0 else 0.0
    return {
        "pits_total":  pits_total,
        "pits_warned": pits_warned,
        "hit_rate":    round(hit_rate, 4),
        "pass":        hit_rate >= PIT_HIT_RATE_MIN,
    }


def validate_spearman(df: pd.DataFrame, predictions: dict) -> dict:
    sev_pred_by_key = {lap["key"]: lap["severity_pred"] for lap in predictions["laps"]}
    df_valid = df[df["DegSeverity"] != -1]

    def _spearman(preds: list, deltas: list):
        if len(preds) < 3 or len(set(preds)) < 2 or len(set(deltas)) < 2:
            return None
        result = stats.spearmanr(preds, deltas)
        if not np.isfinite(result.statistic):
            return None
        return result

    anchor_stint = df_valid[
        (df_valid["Year"] == SPEARMAN_STINT_YEAR) &
        (df_valid["Driver"] == SPEARMAN_STINT_DRIVER) &
        (df_valid["StintId"] == SPEARMAN_STINT_ID)
    ].sort_values("LapNumber")

    anchor_preds, anchor_deltas = [], []
    for _, row in anchor_stint.iterrows():
        key = f"{int(row['Year'])}_{row['Driver']}_{int(row['LapNumber'])}"
        if key in sev_pred_by_key:
            anchor_preds.append(sev_pred_by_key[key])
            anchor_deltas.append(float(row["LapDelta"]))

    anchor_rho = anchor_pval = None
    result = _spearman(anchor_preds, anchor_deltas)
    if result is not None:
        anchor_rho  = round(float(result.statistic), 4)
        anchor_pval = round(float(result.pvalue), 4)

    all_stints = []
    for (year, driver, stint_id), grp in df_valid.groupby(["Year", "Driver", "StintId"]):
        grp = grp.sort_values("LapNumber")
        preds, deltas = [], []
        for _, row in grp.iterrows():
            key = f"{int(year)}_{driver}_{int(row['LapNumber'])}"
            if key in sev_pred_by_key:
                preds.append(sev_pred_by_key[key])
                deltas.append(float(row["LapDelta"]))
        res = _spearman(preds, deltas)
        if res is None:
            continue
        all_stints.append({
            "year": int(year), "driver": driver, "stint_id": int(stint_id),
            "n_laps": len(preds),
            "rho":    round(float(res.statistic), 4),
            "pvalue": round(float(res.pvalue), 4),
        })

    return {
        "anchor_stint": {
            "year": SPEARMAN_STINT_YEAR, "driver": SPEARMAN_STINT_DRIVER,
            "stint_id": SPEARMAN_STINT_ID, "n_laps": len(anchor_preds),
            "rho": anchor_rho, "pvalue": anchor_pval,
        },
        "all_stints": all_stints,
        "pass": anchor_rho is not None and anchor_rho > SPEARMAN_RHO_MIN,
    }


def validate_oos_2024(df: pd.DataFrame, sev_model, features: list) -> dict:
    from sklearn.metrics import f1_score, confusion_matrix as sk_cm

    if OOS_YEAR not in df["Year"].values:
        return {"skipped": True, "reason": f"No {OOS_YEAR} data in labeled_table.csv"}

    df_valid = df[df["DegSeverity"] != -1].copy()
    df_test  = df_valid[df_valid["Year"] == OOS_YEAR]
    df_train = df_valid[df_valid["Year"] != OOS_YEAR]

    if len(df_test) == 0:
        return {"skipped": True, "reason": f"No valid {OOS_YEAR} rows"}

    if len(df_train) == 0:
        return {"skipped": True, "reason": "No non-OOS training data available"}

    # Retrain on non-2024 data for true holdout evaluation (production model trained on all years)
    X_train = df_train[features].values
    y_train = df_train["DegSeverity"].values
    oos_model = xgb.XGBClassifier(
        n_estimators=100, max_depth=4, learning_rate=0.1,
        objective="multi:softprob", eval_metric="mlogloss",
        num_class=len(SEVERITY_CLASSES), use_label_encoder=False, verbosity=0,
    )
    oos_model.fit(X_train, y_train)

    preds = oos_model.predict_proba(df_test[features].values).argmax(axis=1)
    y_test = df_test["DegSeverity"].values

    wf1 = float(f1_score(y_test, preds, average="weighted", zero_division=0))
    cm  = sk_cm(y_test, preds).tolist()

    return {
        "skipped":          False,
        "test_year":        OOS_YEAR,
        "test_rows":        len(df_test),
        "train_rows":       len(df_train),
        "weighted_f1":      round(wf1, 4),
        "confusion_matrix": cm,
        "pass":             wf1 >= OOS_F1_MIN,
        "note":             f"Model retrained on {len(df_train)} rows (excluding {OOS_YEAR}) for true OOS evaluation",
    }


def _beeswarm_figure(shap_data_model: dict, features: list, title: str) -> go.Figure:
    all_keys  = list(shap_data_model.keys())
    shap_mat  = np.array([[shap_data_model[k].get(f, 0.0) for f in features] for k in all_keys])
    importance = np.abs(shap_mat).mean(axis=0)
    top_n  = min(20, len(features))
    top_idx = np.argsort(importance)[::-1][:top_n]
    fig = go.Figure()
    rng = np.random.default_rng(42)
    for rank, feat_idx in enumerate(top_idx):
        feat_name = features[feat_idx]
        vals = shap_mat[:, feat_idx]
        jitter = rng.uniform(-0.3, 0.3, len(vals))
        fig.add_trace(go.Scatter(
            x=vals, y=[rank + j for j in jitter],
            mode="markers",
            marker=dict(size=4, color=vals, colorscale="RdBu_r", showscale=(rank == 0)),
            name=feat_name, showlegend=False,
            text=[f"{feat_name}: {v:.3f}" for v in vals], hoverinfo="text",
        ))
    fig.update_layout(
        title=title, xaxis_title="SHAP value",
        yaxis=dict(tickvals=list(range(top_n)), ticktext=[features[i] for i in top_idx]),
        height=600,
    )
    return fig


def build_html_report(
    df: pd.DataFrame,
    predictions: dict,
    shap_data: dict,
    val_pit: dict,
    val_spear: dict,
    val_oos: dict,
    features: list,
) -> str:
    val_shap = validate_shap_importance(shap_data)

    def _badge(passed: bool) -> str:
        color = "#00C853" if passed else "#D50000"
        label = "PASS" if passed else "FAIL"
        return f'<span style="background:{color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold">{label}</span>'

    oos_badge = _badge(val_oos.get("pass", False)) if not val_oos.get("skipped") else '<span style="color:#888">SKIPPED</span>'

    summary_html = f"""
<h1>LatentLap-AI - Phase 5 Evaluation Report</h1>
<h2>Validation Summary</h2>
<table border="1" cellpadding="6" style="border-collapse:collapse">
<tr><th>Check</th><th>Result</th><th>Detail</th></tr>
<tr><td>[P1] SHAP Feature Importance</td><td>{_badge(val_shap["pass"])}</td>
    <td>Top feat: {val_shap["top_features"][0][0] if val_shap["top_features"] else "N/A"} | found: {val_shap["found"]}</td></tr>
<tr><td>[P2] Pit Timing Hit Rate</td><td>{_badge(val_pit["pass"])}</td>
    <td>hit_rate={val_pit["hit_rate"]:.2f} ({val_pit["pits_warned"]}/{val_pit["pits_total"]} pits)</td></tr>
<tr><td>[P3] Spearman NOR 2022</td><td>{_badge(val_spear["pass"])}</td>
    <td>rho={val_spear["anchor_stint"]["rho"]}</td></tr>
<tr><td>[P4] OOS 2024</td><td>{oos_badge}</td>
    <td>{"F1=" + str(val_oos.get("weighted_f1")) if not val_oos.get("skipped") else val_oos.get("reason","")}</td></tr>
</table>
"""

    plotly_figures = []

    plotly_figures.append(_beeswarm_figure(
        shap_data["shap_values"]["severity"], features,
        "SHAP Feature Importance - Severity Model (top 20)"
    ))
    plotly_figures.append(_beeswarm_figure(
        shap_data["shap_values"]["mode"], features,
        "SHAP Feature Importance - Mode Model (top 20)"
    ))

    # Stint waterfall - NOR 2022 StintId=0
    df_anchor = df[
        (df["Year"] == SPEARMAN_STINT_YEAR) &
        (df["Driver"] == SPEARMAN_STINT_DRIVER) &
        (df["StintId"] == SPEARMAN_STINT_ID)
    ].sort_values("LapNumber")

    sev_pred_by_key = {lap["key"]: lap["severity_pred"] for lap in predictions["laps"]}
    anchor_laps, anchor_preds_list = [], []
    for _, row in df_anchor.iterrows():
        key = f"{int(row['Year'])}_{row['Driver']}_{int(row['LapNumber'])}"
        if key in sev_pred_by_key:
            anchor_laps.append(int(row["LapNumber"]))
            anchor_preds_list.append(sev_pred_by_key[key])

    if anchor_laps:
        fig_wf = go.Figure(go.Bar(x=anchor_preds_list, y=anchor_laps, orientation="h",
                                  marker_color="#FF8000"))
        fig_wf.update_layout(title="NOR 2022 Stint 0 - Severity Predictions per Lap",
                              xaxis_title="Severity (0-3)", yaxis_title="Lap Number", height=400)
        plotly_figures.append(fig_wf)

    # Pit timing event plot
    drivers_years = sorted({(lap["year"], lap["driver"]) for lap in predictions["laps"]})
    fig_pit = go.Figure()
    for idx, (yr, drv) in enumerate(drivers_years):
        laps_drv = sorted([l for l in predictions["laps"] if l["year"] == yr and l["driver"] == drv],
                          key=lambda x: x["lap_number"])
        fig_pit.add_trace(go.Scatter(
            x=[l["lap_number"] for l in laps_drv],
            y=[l["severity_pred"] for l in laps_drv],
            mode="lines+markers", name=f"{yr} {drv}",
        ))
    fig_pit.update_layout(title="Severity Predictions vs Lap Number", height=400)
    plotly_figures.append(fig_pit)

    # Spearman scatter
    fig_sp = go.Figure()
    for stint_info in val_spear["all_stints"]:
        yr, drv, sid = stint_info["year"], stint_info["driver"], stint_info["stint_id"]
        stint_laps = [l for l in predictions["laps"]
                      if l["year"] == yr and l["driver"] == drv and l["stint_id"] == sid]
        df_s = df[(df["Year"] == yr) & (df["Driver"] == drv) & (df["StintId"] == sid)]
        if not stint_laps or df_s.empty:
            continue
        pred_vals = [l["severity_pred"] for l in stint_laps]
        delta_vals = []
        for lap_entry in stint_laps:
            match = df_s[df_s["LapNumber"] == lap_entry["lap_number"]]
            if not match.empty:
                delta_vals.append(float(match["LapDelta"].iloc[0]))
        if len(pred_vals) == len(delta_vals) and len(pred_vals) >= 2:
            fig_sp.add_trace(go.Scatter(
                x=pred_vals, y=delta_vals, mode="markers",
                name=f"{yr} {drv} S{sid} rho={stint_info['rho']}",
            ))
    fig_sp.update_layout(title="Spearman: Severity Rank vs LapDelta Rank",
                         xaxis_title="Severity Pred", yaxis_title="LapDelta (s)", height=400)
    plotly_figures.append(fig_sp)

    # 2024 confusion matrix (if available)
    if not val_oos.get("skipped") and "confusion_matrix" in val_oos:
        cm = val_oos["confusion_matrix"]
        labels = [str(c) for c in SEVERITY_CLASSES[:len(cm)]]
        fig_cm = go.Figure(go.Heatmap(
            z=cm, x=labels, y=labels,
            colorscale="Blues", showscale=True,
        ))
        fig_cm.update_layout(
            title=f"2024 OOS Confusion Matrix (weighted F1={val_oos['weighted_f1']})",
            xaxis_title="Predicted", yaxis_title="True", height=400,
        )
        plotly_figures.append(fig_cm)

    chart_divs = []
    for i, fig in enumerate(plotly_figures):
        include_js = (i == 0)
        chart_divs.append(fig.to_html(full_html=False, include_plotlyjs=include_js))

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset='utf-8'><title>LatentLap-AI Phase 5 Report</title>
<style>body{{font-family:sans-serif;max-width:1200px;margin:auto;padding:20px}}</style>
</head>
<body>
{summary_html}
{''.join(chart_divs)}
</body>
</html>"""
    return html


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 5 - SHAP + Validation")
    parser.add_argument("--ingest", action="store_true")
    args = parser.parse_args()

    if args.ingest:
        ingest_all_years()
        return

    OUTPUTS_DIR.mkdir(exist_ok=True)

    df, sev_model, mode_model, features = load_data()

    print("Computing predictions...")
    predictions = compute_predictions(df, sev_model, mode_model, features)
    print(f"  {len(predictions['laps'])} laps.")
    if not predictions["laps"]:
        raise RuntimeError(
            "No valid laps (DegSeverity != -1) found in labeled_table.csv. "
            "Run: python evaluate.py --ingest"
        )

    print("Computing SHAP values...")
    shap_data = compute_shap(df, sev_model, mode_model, features, predictions)

    print("Running validation checks...")
    val_shap  = validate_shap_importance(shap_data)
    val_pit   = validate_pit_timing(df, predictions)
    val_spear = validate_spearman(df, predictions)
    val_oos   = validate_oos_2024(df, sev_model, features)

    validation_report = {
        "shap_importance": val_shap,
        "pit_timing":      val_pit,
        "spearman":        val_spear,
        "oos_2024":        val_oos,
    }

    print("\nValidation summary:")
    print(f"  [P1] SHAP: {'PASS' if val_shap['pass'] else 'FAIL'} - top feat: {val_shap['top_features'][0][0]}")
    print(f"  [P2] Pit timing hit rate: {val_pit['hit_rate']:.2f} - {'PASS' if val_pit['pass'] else 'FAIL'}")
    anchor_rho = val_spear["anchor_stint"]["rho"]
    print(f"  [P3] Spearman NOR 2022: {anchor_rho} - {'PASS' if val_spear['pass'] else 'FAIL'}")
    if val_oos.get("skipped"):
        print("  [P4] OOS 2024: SKIPPED")
    else:
        print(f"  [P4] OOS 2024 F1: {val_oos['weighted_f1']:.3f} - {'PASS' if val_oos['pass'] else 'FAIL'}")

    print("\nBuilding HTML report...")
    html = build_html_report(df, predictions, shap_data, val_pit, val_spear, val_oos, features)

    print("Writing outputs...")
    SHAP_REPORT_PATH.write_text(html, encoding="utf-8")
    SHAP_DATA_PATH.write_text(json.dumps(shap_data, ensure_ascii=False), encoding="utf-8")
    PREDICTIONS_PATH.write_text(json.dumps(predictions, ensure_ascii=False), encoding="utf-8")
    VALIDATION_REPORT_PATH.write_text(json.dumps(validation_report, indent=2, ensure_ascii=False), encoding="utf-8")

    for path in [SHAP_DATA_PATH, PREDICTIONS_PATH]:
        size_mb = path.stat().st_size / 1_048_576
        flag = "[WARN] >10MB!" if size_mb > 10 else "OK"
        print(f"  {path.name}: {size_mb:.2f} MB {flag}")

    print(f"\nPhase 5 complete. Outputs in {OUTPUTS_DIR}/")


if __name__ == "__main__":
    main()
