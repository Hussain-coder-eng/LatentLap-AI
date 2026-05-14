"""
LatentLap-AI — FastF1 Data Exploration
Silverstone 2021–2025, McLaren only.

Fixes applied:
- TrackStatus filter excludes SC/VSC laps
- DRS remapped to binary DRS_Open flag
- DistanceToDriverAhead used for dirty air (replaces heuristic)
- pick_team/pick_driver → pick_teams/pick_drivers
"""

import fastf1
import pandas as pd
import numpy as np
from pathlib import Path

# ── Cache setup ───────────────────────────────────────────────────────────────
CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))

OUT_DIR = Path("data_exploration")
OUT_DIR.mkdir(exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
TARGET_YEAR   = 2022
TARGET_RACE   = "British Grand Prix"
TARGET_TEAM   = "McLaren"

# TrackStatus values: '1'=clear, '2'=yellow flag, '4'=SC, '6'=VSC, '7'=SC ending
RACING_STATUSES = {"1", "2"}

# Distance range for Maggotts-Becketts-Chapel complex (metres into lap)
MB_START, MB_END = 1200, 2200


# ─────────────────────────────────────────────────────────────────────────────
def load_session(year, race):
    print(f"\nLoading {race} {year} Race...")
    s = fastf1.get_session(year, race, "R")
    s.load(telemetry=True, weather=True, messages=False)
    print("Session loaded.")
    return s


def filter_racing_laps(laps):
    """Remove SC, VSC, formation, outlaps, inlaps, and restart outliers."""
    mask = (
        laps["IsAccurate"] &
        laps["TrackStatus"].isin(RACING_STATUSES) &
        laps["LapTime"].notna()
    )
    filtered = laps[mask].copy()
    # Additional guard: drop laps >130s (restart/formation laps that pass IsAccurate)
    # Silverstone lap time is ~92-96s; 130s = +35% margin catches all legit slow laps
    filtered["_LapTimeSec"] = filtered["LapTime"].dt.total_seconds()
    filtered = filtered[filtered["_LapTimeSec"] < 130].drop(columns=["_LapTimeSec"])
    return filtered


def remap_drs(tel):
    """
    DRS values: 0=unavailable, 2=eligible, 8=opening, 10=open, 14=closing.
    Add binary DRS_Open column.
    """
    tel = tel.copy()
    tel["DRS_Open"] = tel["DRS"].isin([10, 14]).astype(int)
    return tel


def add_dirty_air(tel):
    """
    Use DistanceToDriverAhead (metres) for dirty air proxy.
    Converts to seconds using current speed. Per-telemetry-sample resolution —
    aggregate to per-lap mean before using as a lap-level feature.
    Note: in race traffic a car is often <1.2s from the car ahead for most of
    the lap; the per-lap MEAN gap is the useful signal, not a binary per-sample flag.
    """
    tel = tel.copy()
    speed_ms = tel["Speed"] / 3.6
    speed_ms = speed_ms.replace(0, np.nan)
    gap_seconds = tel["DistanceToDriverAhead"] / speed_ms
    tel["GapAheadSeconds"] = gap_seconds
    tel["DirtyAir"] = (gap_seconds < 1.2).astype(int)
    return tel


def add_lap_dirty_air(laps, session):
    """
    Compute per-lap mean gap to car ahead from telemetry.
    Returns a Series indexed like laps with MeanGapAhead and DirtyAirRatio columns.
    """
    records = []
    for _, lap in laps.iterrows():
        try:
            tel = lap.get_telemetry()
            speed_ms = tel["Speed"] / 3.6
            speed_ms = speed_ms.replace(0, np.nan)
            gap = tel["DistanceToDriverAhead"] / speed_ms
            records.append({
                "LapNumber": lap["LapNumber"],
                "Driver": lap["Driver"],
                "MeanGapAhead": gap.mean(),
                "DirtyAirRatio": (gap < 1.2).mean(),  # fraction of lap in dirty air
            })
        except Exception:
            records.append({
                "LapNumber": lap["LapNumber"],
                "Driver": lap["Driver"],
                "MeanGapAhead": np.nan,
                "DirtyAirRatio": np.nan,
            })
    return pd.DataFrame(records)


def build_lap_features(laps):
    """Compute lap-level pace degradation features."""
    laps = laps.copy()
    laps["LapTimeSec"]  = laps["LapTime"].dt.total_seconds()
    laps["S1Sec"]       = laps["Sector1Time"].dt.total_seconds()
    laps["S2Sec"]       = laps["Sector2Time"].dt.total_seconds()
    laps["S3Sec"]       = laps["Sector3Time"].dt.total_seconds()

    # Stint best + lap delta
    laps["StintBest"]      = laps.groupby(["Driver", "Stint"])["LapTimeSec"].transform("min")
    laps["LapDelta"]       = laps["LapTimeSec"] - laps["StintBest"]
    laps["RollingDelta3"]  = (
        laps.groupby(["Driver", "Stint"])["LapDelta"]
        .transform(lambda x: x.rolling(3, min_periods=1).mean())
    )
    laps["LapVariance"]    = (
        laps.groupby(["Driver", "Stint"])["LapTimeSec"]
        .transform(lambda x: x.rolling(5, min_periods=1).std().fillna(0))
    )

    # Sector consistency (S2 = Maggotts-Becketts, most degradation-sensitive)
    laps["S2Delta"] = laps["S2Sec"] - laps.groupby(["Driver", "Stint"])["S2Sec"].transform("min")

    return laps


def extract_telemetry(lap):
    """Get telemetry for one lap with all fixes applied."""
    tel = lap.get_telemetry()
    tel = remap_drs(tel)
    tel = add_dirty_air(tel)
    return tel


def corner_zone(tel, start=MB_START, end=MB_END):
    """Slice telemetry to a distance zone."""
    return tel[(tel["Distance"] >= start) & (tel["Distance"] <= end)].copy()


# ─────────────────────────────────────────────────────────────────────────────
def main():
    session = load_session(TARGET_YEAR, TARGET_RACE)

    # ── Lap-level data ────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("McLAREN LAPS — after SC/VSC filter")
    print("="*60)

    mcl_laps_raw  = session.laps.pick_teams(TARGET_TEAM)
    mcl_laps      = filter_racing_laps(mcl_laps_raw)
    mcl_laps      = build_lap_features(mcl_laps)
    drivers        = sorted(mcl_laps["Driver"].unique())

    print(f"Drivers: {drivers}")
    print(f"Raw laps: {len(mcl_laps_raw)}  →  After filter: {len(mcl_laps)}")
    print(f"Filtered out: {len(mcl_laps_raw) - len(mcl_laps)} SC/VSC/inlap rows\n")

    # Stint summary
    for drv in drivers:
        drv_laps = mcl_laps[mcl_laps["Driver"] == drv]
        stint_summary = drv_laps.groupby(["Stint", "Compound"]).agg(
            Laps        = ("LapNumber", "count"),
            AvgDelta    = ("LapDelta",  "mean"),
            MaxDelta    = ("LapDelta",  "max"),
            AvgVariance = ("LapVariance", "mean"),
            AvgS2Delta  = ("S2Delta",   "mean"),
        ).reset_index()
        print(f"── {drv} stint summary ──────────────────────────────")
        print(stint_summary.to_string(index=False))
        print()

    # ── Per-lap dirty air (takes ~30s — fetches telemetry per lap) ───────────
    print("="*60)
    print("DIRTY AIR — per-lap mean gap (NOR only, may take ~30s)")
    print("="*60)

    nor_laps_da = mcl_laps[mcl_laps["Driver"] == "NOR"]
    da_df = add_lap_dirty_air(nor_laps_da, session)
    print(da_df.to_string(index=False))
    da_df.to_csv(OUT_DIR / "nor_dirty_air_per_lap.csv", index=False)
    print()

    # ── Telemetry quality check ───────────────────────────────────────────────
    print("="*60)
    print("TELEMETRY CHANNELS + SAMPLING (NOR fastest lap)")
    print("="*60)

    nor_laps    = mcl_laps[mcl_laps["Driver"] == "NOR"]
    fastest_lap = nor_laps.loc[nor_laps["LapTimeSec"].idxmin()]
    tel         = extract_telemetry(fastest_lap)

    print(f"All channels: {tel.columns.tolist()}")
    print(f"Rows: {len(tel)} | Duration: {tel['Time'].max().total_seconds():.1f}s | "
          f"Rate: ~{len(tel)/tel['Time'].max().total_seconds():.1f} Hz\n")

    print("DRS values found:", sorted(tel["DRS"].unique()))
    print("DRS_Open distribution:")
    print(tel["DRS_Open"].value_counts().to_dict())
    print()

    print("Dirty air (GapAheadSeconds) stats:")
    print(f"  Available samples: {tel['GapAheadSeconds'].notna().sum()}/{len(tel)}")
    print(f"  Min gap: {tel['GapAheadSeconds'].min():.2f}s")
    print(f"  Mean gap: {tel['GapAheadSeconds'].mean():.2f}s")
    print(f"  DirtyAir laps (<1.2s): {tel['DirtyAir'].sum()} samples")
    print()

    # ── Maggotts-Becketts zone ────────────────────────────────────────────────
    print("="*60)
    print("MAGGOTTS-BECKETTS-CHAPEL ZONE (1200–2200m)")
    print("="*60)

    mb = corner_zone(tel)
    print(f"Samples in zone: {len(mb)}")
    print(f"Speed range:     {mb['Speed'].min():.0f} – {mb['Speed'].max():.0f} km/h")
    print(f"Min throttle:    {mb['Throttle'].min():.1f}%  (apex load indicator)")
    print(f"Brake events:    {mb['Brake'].sum()}")
    print(f"Gear range:      {int(mb['nGear'].min())} – {int(mb['nGear'].max())}")

    # Key stress metric: sustained full-throttle high-speed zone (before braking)
    pre_brake = mb[mb["Brake"] == False]
    print(f"\nPre-brake (pure lateral load) zone:")
    print(f"  Samples: {len(pre_brake)}")
    print(f"  Distance span: {pre_brake['Distance'].min():.0f}m – {pre_brake['Distance'].max():.0f}m")
    print(f"  Avg speed: {pre_brake['Speed'].mean():.0f} km/h")
    print(f"  Time in zone: {pre_brake['Time'].max().total_seconds() - pre_brake['Time'].min().total_seconds():.2f}s")
    print()

    # ── Lap-level feature table (NOR) ─────────────────────────────────────────
    print("="*60)
    print("LAP FEATURE TABLE — NOR (cleaned)")
    print("="*60)

    cols = ["LapNumber", "Compound", "TyreLife", "Stint",
            "LapTimeSec", "LapDelta", "RollingDelta3", "LapVariance", "S2Delta"]
    print(nor_laps[cols].to_string(index=False))
    print()

    # ── Weather ───────────────────────────────────────────────────────────────
    print("="*60)
    print("WEATHER")
    print("="*60)

    wx = session.weather_data
    print(f"Columns: {wx.columns.tolist()}")
    for col in ["TrackTemp", "AirTemp", "Humidity", "WindSpeed"]:
        print(f"  {col}: {wx[col].min():.1f} – {wx[col].max():.1f}")
    print()

    # ── Save outputs ──────────────────────────────────────────────────────────
    save_cols = [
        "LapNumber", "Driver", "Team", "Compound", "TyreLife", "Stint",
        "LapTimeSec", "S1Sec", "S2Sec", "S3Sec",
        "LapDelta", "RollingDelta3", "LapVariance", "S2Delta",
        "SpeedI1", "SpeedI2", "SpeedFL", "SpeedST",
        "IsPersonalBest", "TrackStatus",
    ]
    mcl_laps[save_cols].to_csv(OUT_DIR / "mcl_silverstone_2022_laps_clean.csv", index=False)

    tel_cols = ["Time", "Distance", "Speed", "Throttle", "Brake",
                "nGear", "RPM", "DRS", "DRS_Open", "X", "Y",
                "DistanceToDriverAhead", "GapAheadSeconds", "DirtyAir"]
    tel[tel_cols].to_csv(OUT_DIR / "nor_fastest_lap_telemetry_clean.csv", index=False)

    wx.to_csv(OUT_DIR / "silverstone_2022_weather.csv", index=False)

    print("="*60)
    print("FILES SAVED:")
    print("  mcl_silverstone_2022_laps_clean.csv  ← lap features, SC filtered")
    print("  nor_fastest_lap_telemetry_clean.csv  ← telemetry with DRS_Open + DirtyAir")
    print("  silverstone_2022_weather.csv")
    print("="*60)


if __name__ == "__main__":
    main()
