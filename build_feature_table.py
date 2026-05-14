"""
LatentLap-AI — Phase 2: Feature Engineering
Builds a complete lap-level feature table for all McLaren Silverstone sessions 2021-2025.

Output: data/feature_table.csv  (and .parquet)

Feature groups:
  1. Pace Degradation      — lap delta, rolling delta, sector loss, variance,
                             fuel-corrected time, intra-lap sector decay,
                             push-recovery delta, degradation rate acceleration,
                             early-stint quadratic curvature (graining discriminator)
  2. Driver Aggression     — throttle rate, braking intensity, exit smoothness,
                             lockup events, lift-and-coast indicator,
                             effective push factor
  3. Tire Energy           — signed lateral G (FL/FR split), Savitzky-Golay smoothed,
                             sustained lateral energy index (blistering),
                             slip proxy at steady-state curvature (graining),
                             yaw rate + yaw acceleration, longitudinal work proxy
  4. Corner Zones          — Copse, Maggotts-Becketts-Chapel, Stowe, Club
                             (entry speed, peak G, brake fraction, traction load)
  5. Race Context          — fuel estimate + correction, compound encoding,
                             weather merge, wind projection onto Hangar Straight,
                             out-lap/in-lap/post-SC flags, compound OOW flag,
                             cumulative stint energy, thermal accumulation proxy
  6. Dirty Air             — mean gap ahead, dirty air ratio (fraction <1.2s)

Run:
  python build_feature_table.py
  python build_feature_table.py --year 2022
  python build_feature_table.py --dry-run
"""

import argparse
import warnings
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter

warnings.filterwarnings("ignore", category=FutureWarning)

# ── Config ────────────────────────────────────────────────────────────────────
YEARS         = [2021, 2022, 2023, 2024, 2025]
RACE_NAME     = "British Grand Prix"
TEAM          = "McLaren"
CACHE_DIR     = Path("cache")
DATA_DIR      = Path("data")
RACING_STATUS = {"1", "2"}
MAX_LAP_SEC   = 130
FUEL_START_KG = 110.0
FUEL_CORR_SEC_PER_KG = 0.035   # industry standard 0.03–0.04 s/kg

# Hangar Straight bearing (degrees) for wind projection
HANGAR_BEARING_DEG = 135.0     # NW-SE axis at Silverstone

# Silverstone corner distance zones (metres into lap from start/finish)
# Validated against FastF1 2022 telemetry — adjust if circuit layout differs
CORNER_ZONES = {
    "Copse":  (580,  820),   # T9  — high-speed right, peak FL load
    "MB":    (1200, 2200),   # T10–13 — Maggotts-Becketts-Chapel complex
    "Stowe": (3100, 3400),   # T15 — heavy braking, right-hander
    "Club":  (4200, 4700),   # T17–18 — long right, rear traction load
}

G = 9.81  # m/s²


# ─────────────────────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────────────────────

def setup():
    CACHE_DIR.mkdir(exist_ok=True)
    DATA_DIR.mkdir(exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))


def load_session(year: int):
    try:
        s = fastf1.get_session(year, RACE_NAME, "R")
        s.load(telemetry=True, weather=True, messages=False)
        return s
    except Exception as e:
        print(f"  [WARN] {year}: could not load — {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Lap filtering + quality flags
# ─────────────────────────────────────────────────────────────────────────────

def filter_laps(laps: pd.DataFrame) -> pd.DataFrame:
    """Keep only clean racing laps; add quality flag columns."""
    mask = (
        laps["IsAccurate"]
        & laps["TrackStatus"].isin(RACING_STATUS)
        & laps["LapTime"].notna()
    )
    df = laps[mask].copy()
    df["_sec"] = df["LapTime"].dt.total_seconds()
    df = df[df["_sec"] < MAX_LAP_SEC].drop(columns=["_sec"])

    # Out-lap: first lap on a fresh set (driver still warming up)
    df["OutLap"] = (df["TyreLife"] <= 1).astype(int)

    # In-lap: lap ending with a pit stop
    df["InLap"] = df["PitInTime"].notna().astype(int)

    # Post-SC lap: first 2 laps where TrackStatus just returned to green
    # Mark laps following any SC/VSC period (status 4 or 6)
    df_sorted = df.sort_values(["Driver", "LapNumber"])
    df["PostSC_Lap"] = 0
    for drv, grp in df_sorted.groupby("Driver"):
        ts = grp["TrackStatus"].tolist()
        idx = grp.index.tolist()
        for i in range(1, len(ts)):
            if ts[i] in {"1", "2"} and ts[i - 1] in {"4", "6", "7"}:
                # Mark this lap and the next as post-SC
                for j in range(i, min(i + 2, len(idx))):
                    df.loc[idx[j], "PostSC_Lap"] = 1

    return df


def encode_compound(s: pd.Series) -> pd.Series:
    mapping = {"SOFT": 0, "MEDIUM": 1, "HARD": 2,
               "INTERMEDIATE": 3, "WET": 4}
    return s.map(mapping).fillna(1).astype(int)


# ─────────────────────────────────────────────────────────────────────────────
# Feature group 1 — Pace Degradation (lap-level)
# ─────────────────────────────────────────────────────────────────────────────

def pace_features(laps: pd.DataFrame, total_laps: int) -> pd.DataFrame:
    df = laps.copy()
    df["LapTimeSec"] = df["LapTime"].dt.total_seconds()
    df["S1Sec"]      = df["Sector1Time"].dt.total_seconds()
    df["S2Sec"]      = df["Sector2Time"].dt.total_seconds()
    df["S3Sec"]      = df["Sector3Time"].dt.total_seconds()

    grp = ["Driver", "Stint"]

    # Fuel estimate (needed here for fuel-corrected lap time)
    df["FuelEstKg"] = FUEL_START_KG * (1 - (df["LapNumber"] - 1) / max(total_laps, 1))
    df["FuelCorrLapTime"] = df["LapTimeSec"] - FUEL_CORR_SEC_PER_KG * df["FuelEstKg"]

    # Pace deltas (on fuel-corrected times for accuracy)
    df["StintBest"]      = df.groupby(grp)["FuelCorrLapTime"].transform("min")
    df["LapDelta"]       = df["FuelCorrLapTime"] - df["StintBest"]
    df["RollingDelta3"]  = df.groupby(grp)["LapDelta"].transform(
        lambda x: x.rolling(3, min_periods=1).mean()
    )
    df["LapVariance"]    = df.groupby(grp)["LapTimeSec"].transform(
        lambda x: x.rolling(5, min_periods=1).std().fillna(0)
    )
    df["DeltaRate"]      = df.groupby(grp)["LapDelta"].transform(
        lambda x: x.diff().fillna(0)
    )

    # Sector 2 loss — Maggotts-Becketts, highest tire stress
    df["S2Best"]  = df.groupby(grp)["S2Sec"].transform("min")
    df["S2Delta"] = df["S2Sec"] - df["S2Best"]

    # Degradation rate acceleration (change in rate = blister warning signal)
    df["DegRateAccel"] = df.groupby(grp)["DeltaRate"].transform(
        lambda x: x.diff().fillna(0)
    )

    # Intra-lap sector decay: S3 getting worse than S1 = thermal within-lap progression
    # Thermal degrades across a lap; wear/blistering degrades across laps
    df["S3_S1_Decay"]  = df["S3Sec"] - df["S1Sec"]
    df["S3_S1_DecayZ"] = df.groupby(["Driver", "Compound"])["S3_S1_Decay"].transform(
        lambda x: (x - x.mean()) / (x.std() + 1e-6)
    )

    # Push-lap recovery delta: LapDelta(n+1) - LapDelta(n)
    # Negative after a push = thermal recovery (reversible)
    # Non-negative = structural (wear or blister)
    df["NextLapDelta"]       = df.groupby(grp)["LapDelta"].transform(lambda x: x.shift(-1))
    df["PushRecoveryDelta"]  = df["NextLapDelta"] - df["LapDelta"]

    # Early-stint quadratic curvature (first 8 laps of stint)
    # Concave-up (positive) = graining recovering; concave-down = thermal/wear
    _concavity = {}
    for _key, _grp in df.groupby(grp):
        _early = _grp[_grp["TyreLife"] <= 8]
        if len(_early) < 4:
            _val = 0.0
        else:
            try:
                _coeffs = np.polyfit(_early["TyreLife"].values, _early["LapDelta"].values, 2)
                _val = float(_coeffs[0])
            except Exception:
                _val = 0.0
        for _idx in _grp.index:
            _concavity[_idx] = _val
    df["EarlyStintConcavity"] = pd.Series(_concavity)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Feature group 5 — Race Context (lap-level)
# ─────────────────────────────────────────────────────────────────────────────

def context_features(laps: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    df = laps.copy()
    df["CompoundCode"] = encode_compound(df["Compound"])

    for col in ["SpeedI1", "SpeedI2", "SpeedFL", "SpeedST"]:
        if col not in df.columns:
            df[col] = np.nan

    # Weather merge — nearest sample to each lap start
    if not weather.empty and "Time" in weather.columns:
        wx_cols = ["Time", "TrackTemp", "AirTemp", "Humidity",
                   "WindSpeed", "WindDirection", "Rainfall"]
        wx_cols = [c for c in wx_cols if c in weather.columns]
        wx = weather[wx_cols].copy()

        rows = []
        for _, lap in df.iterrows():
            lap_t = lap.get("LapStartTime", pd.NaT)
            if pd.isna(lap_t):
                row = {c: np.nan for c in wx_cols if c != "Time"}
            else:
                idx = (wx["Time"] - lap_t).abs().idxmin()
                row = wx.loc[idx, [c for c in wx_cols if c != "Time"]].to_dict()
            rows.append(row)

        wx_df = pd.DataFrame(rows, index=df.index)
        df = pd.concat([df, wx_df], axis=1)

        # Wind projection onto Hangar Straight (NW-SE, ~135°)
        if "WindDirection" in df.columns and "WindSpeed" in df.columns:
            bearing_rad = np.radians(HANGAR_BEARING_DEG)
            wind_rad    = np.radians(df["WindDirection"].fillna(0))
            df["WindProjectionHangar"] = (
                df["WindSpeed"].fillna(0) * np.cos(wind_rad - bearing_rad)
            )
            # Positive = tailwind into Copse (extra load risk)
        else:
            df["WindProjectionHangar"] = np.nan
    else:
        for col in ["TrackTemp", "AirTemp", "Humidity", "WindSpeed",
                    "WindDirection", "Rainfall", "WindProjectionHangar"]:
            df[col] = np.nan

    # Compound out-of-operating-window flag
    df["CompoundOOW"] = (
        ((df["Compound"] == "SOFT")   & (df["TrackTemp"].fillna(30) > 40)) |
        ((df["Compound"] == "HARD")   & (df["TrackTemp"].fillna(30) < 25))
    ).astype(int)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Telemetry helpers
# ─────────────────────────────────────────────────────────────────────────────

def smooth_xy(x: np.ndarray, y: np.ndarray, window: int = 11, poly: int = 3):
    """Savitzky-Golay smoothing on position data before differentiation."""
    n = len(x)
    w = min(window, n if n % 2 == 1 else n - 1)
    if w < poly + 2:
        return x, y
    return savgol_filter(x, w, poly), savgol_filter(y, w, poly)


def compute_signed_curvature(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Signed path curvature from X/Y positions.
    Positive = left turn, negative = right turn (standard orientation).
    """
    dx  = np.gradient(x)
    dy  = np.gradient(y)
    ddx = np.gradient(dx)
    ddy = np.gradient(dy)
    denom = (dx**2 + dy**2) ** 1.5
    with np.errstate(divide="ignore", invalid="ignore"):
        kappa = np.where(denom > 1e-6, (dx * ddy - dy * ddx) / denom, 0.0)
    return kappa


def count_events(mask: np.ndarray) -> int:
    """Count distinct True-runs in a boolean array."""
    if not np.any(mask):
        return 0
    transitions = np.diff(mask.astype(int))
    return int(np.sum(transitions == 1)) + (1 if mask[0] else 0)


def corner_zone_features(tel: pd.DataFrame, kappa: np.ndarray,
                         lat_g: np.ndarray, dt: np.ndarray,
                         name: str, d_start: float, d_end: float) -> dict:
    """Extract standard feature set for one named corner zone."""
    dist = tel["Distance"].values.astype(float)
    speed = tel["Speed"].values.astype(float)
    throttle = tel["Throttle"].values.astype(float)
    brake = tel["Brake"].values.astype(bool)

    z = (dist >= d_start) & (dist <= d_end)
    if not np.any(z):
        return {f"{name}_{k}": np.nan for k in
                ["EntrySpeed", "MinSpeed", "PeakLatG", "AvgLatG",
                 "BrakeFraction", "AvgThrottle", "TimeSec"]}

    return {
        f"{name}_EntrySpeed":    speed[z][0]                  if len(speed[z]) else np.nan,
        f"{name}_MinSpeed":      float(np.min(speed[z])),
        f"{name}_PeakLatG":      float(np.max(np.abs(lat_g[z]))),
        f"{name}_AvgLatG":       float(np.nanmean(np.abs(lat_g[z]))),
        f"{name}_BrakeFraction": float(np.mean(brake[z])),
        f"{name}_AvgThrottle":   float(np.mean(throttle[z])),
        f"{name}_TimeSec":       float(np.sum(dt[z])),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Feature group 2+3+4+6 — Telemetry-derived (per-lap loop)
# ─────────────────────────────────────────────────────────────────────────────

def compute_telemetry_features(lap) -> dict:
    try:
        tel = lap.get_telemetry()
    except Exception:
        return {}
    if tel.empty or len(tel) < 20:
        return {}

    # Raw arrays
    speed    = tel["Speed"].values.astype(float)       # km/h
    throttle = tel["Throttle"].values.astype(float)
    brake    = tel["Brake"].values.astype(bool)
    gear     = tel["nGear"].values.astype(float)
    rpm      = tel["RPM"].values.astype(float)
    dist     = tel["Distance"].values.astype(float)
    x_raw    = tel["X"].values.astype(float)
    y_raw    = tel["Y"].values.astype(float)
    dt_sec   = tel["Time"].diff().dt.total_seconds().fillna(0.13).values  # ~7.7 Hz → ~0.13s

    v_ms = speed / 3.6   # m/s

    # ── Signed curvature (Savitzky-Golay smoothed) ────────────────────────────
    x_sm, y_sm = smooth_xy(x_raw, y_raw)
    kappa      = compute_signed_curvature(x_sm, y_sm)  # 1/m
    lat_g      = v_ms**2 * kappa / G                   # signed lateral G
    lat_g_abs  = np.abs(lat_g)

    # FL (right-handers: kappa < 0) vs FR (left-handers: kappa > 0) at Silverstone
    # Verify sign convention: Silverstone has 11 right-handers → expect more kappa<0 time
    right_mask = (kappa < -1e-4) & (lat_g_abs > 1.0)
    left_mask  = (kappa >  1e-4) & (lat_g_abs > 1.0)
    right_g_sec = float(np.sum(dt_sec[right_mask]))
    left_g_sec  = float(np.sum(dt_sec[left_mask]))
    fl_asymmetry = right_g_sec / max(left_g_sec, 0.01)

    # Yaw rate and yaw acceleration
    yaw_rate = v_ms * kappa                            # rad/s
    yaw_accel = np.gradient(yaw_rate) / np.maximum(dt_sec, 0.01)

    # ── Dirty air ─────────────────────────────────────────────────────────────
    gap_dist = tel["DistanceToDriverAhead"].values.astype(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        gap_sec = np.where(v_ms > 1, gap_dist / v_ms, np.nan)
    mean_gap       = float(np.nanmean(gap_sec))
    dirty_ratio    = float(np.nanmean(gap_sec < 1.2)) if not np.all(np.isnan(gap_sec)) else np.nan

    # ── Driver aggression ─────────────────────────────────────────────────────
    d_throttle     = np.diff(throttle, prepend=throttle[0])
    throttle_rate  = float(np.mean(d_throttle[d_throttle > 0])) if np.any(d_throttle > 0) else 0.0
    throttle_var   = float(np.std(throttle[~brake])) if np.any(~brake) else 0.0

    d_speed_dt = np.gradient(speed) / np.maximum(dt_sec, 0.01)   # km/h/s
    brake_decel = float(np.abs(np.mean(d_speed_dt[brake]))) if np.any(brake) else 0.0

    hs_corner_sec = float(np.sum(dt_sec[(speed > 200) & (gear < 8)]))

    # Lockup events: rapid decel while braking at speed with lateral load
    lockup_mask   = brake & (d_speed_dt < -45) & (speed > 150) & (lat_g_abs > 1.5)
    lockup_events = count_events(lockup_mask)

    # Lift-and-coast: throttle <20%, not braking, >200 km/h, near brake zone
    lac_mask     = (~brake) & (throttle < 20) & (speed > 200)
    lac_events   = count_events(lac_mask)
    lac_time_pct = float(np.sum(dt_sec[lac_mask])) / max(float(np.sum(dt_sec)), 1.0)

    # ── Tire energy — lateral ─────────────────────────────────────────────────
    avg_lat_g    = float(np.nanmean(lat_g_abs))
    max_lat_g    = float(np.nanmax(lat_g_abs))
    high_g_sec   = float(np.sum(dt_sec[lat_g_abs > 2.0]))

    # Sustained Lateral Energy Index (SLEI) — 2s rolling window max
    # Targets blistering: localized sustained core heating, not average
    window_samples = max(1, int(2.0 / np.mean(dt_sec)))
    lat_g_sq_v     = lat_g_abs**2 * v_ms
    slei_windows   = [
        np.trapezoid(lat_g_sq_v[i:i+window_samples], dt_sec[i:i+window_samples])
        for i in range(0, max(1, len(lat_g_sq_v) - window_samples), window_samples)
    ]
    slei = float(np.max(slei_windows)) if slei_windows else 0.0

    # Cumulative lateral energy (tire work integral) — targets wear
    lat_energy_total = float(np.trapezoid(lat_g_abs * v_ms, dt_sec))

    # ── Tire energy — longitudinal ────────────────────────────────────────────
    # Total longitudinal energy: |a_long × v| integrated
    a_long = np.gradient(v_ms) / np.maximum(dt_sec, 0.01)   # m/s²
    long_energy = float(np.trapezoid(np.abs(a_long) * v_ms, dt_sec))

    # Power traction proxy — throttle × RPM (normalised)
    long_proxy = float(np.mean(throttle * rpm / 1e6))

    # ── Slip proxy at steady-state curvature ─────────────────────────────────
    # In steady-state corners: speed decay not from aero drag = sliding
    # Steady-state = curvature stable, throttle stable, not braking, cornering
    d_kappa      = np.abs(np.gradient(kappa))
    d_throttle_a = np.abs(np.gradient(throttle))
    ss_mask = (
        (d_kappa < np.percentile(d_kappa, 30)) &
        (d_throttle_a < 5) &
        (~brake) &
        (lat_g_abs > 1.0)
    )
    if np.any(ss_mask):
        slip_proxy = float(np.mean(-np.gradient(speed)[ss_mask]))
    else:
        slip_proxy = 0.0

    # Yaw acceleration spikes beyond curvature changes (transient slide events)
    yaw_accel_residual = np.abs(yaw_accel) - np.abs(np.gradient(kappa) * v_ms)
    yaw_spike_count    = count_events(
        yaw_accel_residual > np.percentile(np.abs(yaw_accel_residual), 90)
    )

    # ── Corner zone features ──────────────────────────────────────────────────
    feats: dict = {}
    for zone_name, (d0, d1) in CORNER_ZONES.items():
        feats.update(corner_zone_features(tel, kappa, lat_g, dt_sec, zone_name, d0, d1))

    # Pre-brake lateral zone within MB (pure sustained G)
    mb_mask = (dist >= CORNER_ZONES["MB"][0]) & (dist <= CORNER_ZONES["MB"][1])
    pb_mask = mb_mask & ~brake
    feats["MB_PreBrakeSpeed"] = float(np.mean(speed[pb_mask])) if np.any(pb_mask) else np.nan
    feats["MB_PreBrakeLatG"]  = float(np.nanmean(lat_g_abs[pb_mask])) if np.any(pb_mask) else np.nan
    feats["MB_PreBrakeTime"]  = float(np.sum(dt_sec[pb_mask]))

    # Club exit traction load (long right-hander onto main straight)
    club_mask = (dist >= CORNER_ZONES["Club"][0]) & (dist <= CORNER_ZONES["Club"][1])
    if np.any(club_mask):
        feats["Club_ExitThrottle"] = float(np.mean(throttle[club_mask & (throttle > 50)]))
    else:
        feats["Club_ExitThrottle"] = np.nan

    # FL load asymmetry (Silverstone-specific: right-handers dominate)
    feats.update({
        "RightHandGSec":     right_g_sec,
        "LeftHandGSec":      left_g_sec,
        "FL_LoadAsymmetry":  fl_asymmetry,

        # Dirty air
        "MeanGapAhead":      mean_gap,
        "DirtyAirRatio":     dirty_ratio,

        # Aggression
        "ThrottleRate":      throttle_rate,
        "ThrottleVariance":  throttle_var,
        "BrakeDecel":        brake_decel,
        "HighSpeedCornerSec":hs_corner_sec,
        "LockupEvents":      float(lockup_events),
        "LiftCoastEvents":   float(lac_events),
        "LiftCoastTimePct":  lac_time_pct,

        # Lateral energy
        "AvgLatG":           avg_lat_g,
        "MaxLatG":           max_lat_g,
        "HighGTimeSec":      high_g_sec,
        "SLEI":              slei,
        "LatEnergyTotal":    lat_energy_total,

        # Longitudinal energy
        "LongEnergyTotal":   long_energy,
        "LongLoadProxy":     long_proxy,

        # Slip + yaw
        "SlipProxy":         slip_proxy,
        "YawSpikeCount":     float(yaw_spike_count),

        # Avg yaw rate (cornering aggression)
        "AvgYawRate":        float(np.nanmean(np.abs(yaw_rate))),
    })

    return feats


def build_telemetry_features(laps: pd.DataFrame) -> pd.DataFrame:
    records = []
    total   = len(laps)
    for i, (_, lap) in enumerate(laps.iterrows(), 1):
        drv   = lap["Driver"]
        lap_n = lap["LapNumber"]
        print(f"  tel {i}/{total}  {drv} lap {int(lap_n):3d}", end="\r", flush=True)
        feats              = compute_telemetry_features(lap)
        feats["Driver"]    = drv
        feats["LapNumber"] = lap_n
        records.append(feats)
    print()
    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Post-merge features (need both pace and telemetry data)
# ─────────────────────────────────────────────────────────────────────────────

def post_merge_features(df: pd.DataFrame) -> pd.DataFrame:
    """Features that require columns from both pace and telemetry groups."""
    grp = ["Driver", "Stint"]

    # Effective push factor: aggression × dirty air interaction
    # High aggression in dirty air = thermal red zone (reduced front cooling)
    df["AggressionZ"] = df.groupby(["Driver", "Compound"])["ThrottleRate"].transform(
        lambda x: (x - x.mean()) / (x.std() + 1e-6)
    )
    df["EffectivePushFactor"] = df["AggressionZ"] * (1 + df["DirtyAirRatio"].fillna(0))

    # Thermal accumulation proxy (TAP): cumulative high-G time weighted by TrackTemp
    # Blistering = sustained load conditional on insufficient thermal recovery
    temp_above_30 = (df["TrackTemp"].fillna(30) - 30).clip(lower=0)
    df["LapThermalLoad"] = df["HighGTimeSec"] * temp_above_30

    # Exponential decay across laps (tau ≈ 1.5 laps thermal recovery)
    tau = 1.5
    _tap_map = {}
    for _key, _grp in df.groupby(grp):
        vals = _grp["LapThermalLoad"].fillna(0).values
        acc = 0.0
        for _idx, v in zip(_grp.index, vals):
            acc = acc * np.exp(-1 / tau) + v
            _tap_map[_idx] = acc
    df["ThermalAccumProxy"] = pd.Series(_tap_map)

    # Cumulative lateral energy per stint (wear index)
    df["CumLatEnergy"] = df.groupby(grp)["LatEnergyTotal"].transform("cumsum")

    # Stint energy budget fraction:
    # Normalise by compound nominal budget (learned from data; initialise with priors)
    compound_budget = {"SOFT": 4000, "MEDIUM": 6000, "HARD": 9000,
                       "INTERMEDIATE": 7000, "WET": 8000}
    df["CompoundBudget"]     = df["Compound"].map(compound_budget).fillna(6000)
    df["StintEnergyFraction"]= df["CumLatEnergy"] / df["CompoundBudget"]

    # Severity Index (SI): composite tire stress per lap
    # z-score each component per driver/compound, then sum
    for col in ["LatEnergyTotal", "ThrottleRate", "LapThermalLoad"]:
        df[f"_{col}_z"] = df.groupby(["Driver", "Compound"])[col].transform(
            lambda x: (x - x.mean()) / (x.std() + 1e-6)
        )
    df["SeverityIndex"] = (
        df["_LatEnergyTotal_z"] + df["_ThrottleRate_z"] + df["_LapThermalLoad_z"]
    ) * (1 + df["DirtyAirRatio"].fillna(0))
    df.drop(columns=[c for c in df.columns if c.startswith("_") and c.endswith("_z")],
            inplace=True)

    # Per-driver z-scoring of aggression features
    # Norris, Piastri, Sainz, Ricciardo have different aggression baselines
    for col in ["ThrottleRate", "BrakeDecel", "SlipProxy"]:
        if col in df.columns:
            df[f"{col}_DriverZ"] = df.groupby("Driver")[col].transform(
                lambda x: (x - x.mean()) / (x.std() + 1e-6)
            )

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Per-session pipeline
# ─────────────────────────────────────────────────────────────────────────────

def process_session(session, year: int, dry_run: bool = False):
    print(f"  Filtering laps...")
    raw  = session.laps.pick_teams(TEAM)
    laps = filter_laps(raw)
    print(f"  {len(raw)} raw → {len(laps)} clean laps")

    if laps.empty:
        print("  [SKIP] no clean laps")
        return None

    if dry_run:
        first_driver = laps["Driver"].iloc[0]
        laps = laps[laps["Driver"] == first_driver].head(10)
        print(f"  [DRY RUN] {first_driver}, first 10 laps")

    total_laps = int(session.laps["LapNumber"].max())

    print("  Building pace + context features...")
    df = pace_features(laps, total_laps)
    df = context_features(df, session.weather_data)

    print("  Building telemetry features (per-lap, ~7.7 Hz)...")
    tel_df = build_telemetry_features(laps)   # original FastF1 laps, not df
    df     = df.merge(tel_df, on=["Driver", "LapNumber"], how="left")

    print("  Building post-merge derived features...")
    df = post_merge_features(df)

    df["Year"] = year

    # Drop internal FastF1 housekeeping columns
    drop_cols = [c for c in df.columns if
                 "SessionTime" in c or c in {
                     "PitInTime", "PitOutTime", "LapStartDate", "LapStartTime",
                     "FastF1Generated", "Deleted", "DeletedReason",
                     "IsPersonalBest", "Time", "StintBest", "S2Best",
                     "NextLapDelta", "CompoundBudget",
                 }]
    df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main(years: list, dry_run: bool = False):
    setup()
    all_frames = []

    for year in years:
        print(f"\n{'='*60}")
        print(f"  {year} — {RACE_NAME} — {TEAM}")
        print(f"{'='*60}")
        session = load_session(year)
        if session is None:
            continue
        df = process_session(session, year, dry_run=dry_run)
        if df is not None:
            all_frames.append(df)
            print(f"  ✓ {len(df)} laps, {len(df.columns)} features")

    if not all_frames:
        print("\n[ERROR] No data collected.")
        return

    feature_table = pd.concat(all_frames, ignore_index=True)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("FEATURE TABLE SUMMARY")
    print(f"{'='*60}")
    print(f"Laps:     {len(feature_table)}")
    print(f"Features: {len(feature_table.columns)}")

    missing = feature_table.isnull().sum()
    missing = missing[missing > 0]
    if missing.empty:
        print("Missing:  none")
    else:
        print(f"Missing:\n{missing.to_string()}")

    print(f"\nLaps per year:")
    print(feature_table.groupby("Year")["LapNumber"].count().to_string())

    print(f"\nLapDelta mean ± std per driver:")
    print(feature_table.groupby(["Year", "Driver"])["LapDelta"]
          .agg(["mean", "std", "count"]).round(3).to_string())

    print(f"\nAll feature columns:")
    for i, col in enumerate(sorted(feature_table.columns), 1):
        print(f"  {i:3d}. {col}")

    # ── Save ──────────────────────────────────────────────────────────────────
    suffix   = "_dry" if dry_run else ""
    csv_path = DATA_DIR / f"feature_table{suffix}.csv"
    pq_path  = DATA_DIR / f"feature_table{suffix}.parquet"

    feature_table.to_csv(csv_path, index=False)
    feature_table.to_parquet(pq_path, index=False)

    print(f"\nSaved:")
    print(f"  {csv_path}  ({csv_path.stat().st_size/1024:.1f} KB)")
    print(f"  {pq_path}   ({pq_path.stat().st_size/1024:.1f} KB)")
    print(f"\nNext: python build_labels.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year",    type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    target_years = [args.year] if args.year else YEARS
    main(target_years, dry_run=args.dry_run)
