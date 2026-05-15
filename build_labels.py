#!/usr/bin/env python3
"""
Phase 3 — Weak Supervision Labels

Assigns heuristic tire degradation labels to data/feature_table.csv.

IMPORTANT: Labels are proxy approximations derived from observable pace and
load signals — NOT physical tire state measurements.  They are suitable for
training an XGBoost classifier (Phase 4) and must be presented as such in
any output.

Label columns added
-------------------
StintId      int    — stint index per driver (0, 1, 2, ...)
DegSeverity  int    — 0=nominal  1=mild  2=moderate  3=severe  -1=unreliable
FailureMode  str    — graining | blistering | thermal | wear | none | unreliable

Outputs
-------
data/labeled_table.csv
data/labeled_table.parquet
"""

import pandas as pd
import numpy as np

DATA_PATH      = "data/feature_table.csv"
OUTPUT_CSV     = "data/labeled_table.csv"
OUTPUT_PARQUET = "data/labeled_table.parquet"

# ── Severity thresholds (LapDelta distance above stint best) ─────────────────
DELTA_GRADE0          = 0.20   # < 0.20s  → Grade 0  (nominal pace)
DELTA_GRADE1          = 0.60   # < 0.60s  → Grade 1  (mild)
DELTA_GRADE2          = 1.10   # < 1.10s  → Grade 2  (moderate); above → Grade 3
# Above p75 of RollingDelta3 in Grade-0/1 laps — sustained rolling pace-loss (2022 corrected; re-evaluate for multi-year).
ROLLING_GRADE2_THRESH = 0.60   # RollingDelta3 > 0.60 upgrades to at least Grade 2
DEGRATEACCEL_GRADE3   = 1.50   # DegRateAccel  > 1.50 upgrades to Grade 3
OUTLIER_DELTA_CAP     = 8.0    # LapDelta > 8s → flag as -1 (unreliable)
PRE_PIT_LAPS          = 3      # last N laps of a stint get +1 severity boost

# ── Failure mode thresholds ──────────────────────────────────────────────────
# p90 of SLEI on chunked-window 2022 feature_table.csv (C-1 fix applied); recalibrate after regenerating with rolling-window code.
SLEI_BLISTER          = 30.479
THERMAL_ACCUM_BLISTER = 0.010  # ThermalAccumProxy above this in combo
DEGRATEACCEL_BLISTER  = 1.00   # DegRateAccel threshold for late-stint combo
TYRELIFE_LATE         = 15     # "late stint" for blistering combo rule

# Graining (concave-up early stint, erratic pace)
# Natural gap in 2022 data: max non-RIC EarlyStintConcavity ≈ 0.03; RIC concave-up
# stint coefficient = 0.325. Threshold 0.32 sits inside this gap (2022 only; re-evaluate
# when 2021/2023-2025 data is added).
CONCAVITY_GRAIN       = 0.32   # EarlyStintConcavity > this → concave-up pattern
TYRELIFE_EARLY        = 10     # graining occurs early in stint
# Flags 7 genuinely erratic laps on FuelCorrLapTime-based LapVariance (2022 corrected; re-evaluate for multi-year).
LAPVAR_GRAIN          = 0.80   # LapVariance > this → erratic pace symptom

# Thermal (rapid early degradation then partial recovery)
PUSH_RECOVERY_THERMAL = -0.30  # PushRecoveryDelta < this → initial rapid decay
TYRELIFE_THERMAL_MAX  = 12     # thermal deg manifests early-mid stint

# Wear (residual monotonic degradation category)
DELTA_WEAR            = 0.60   # minimum LapDelta to call wear


# ─────────────────────────────────────────────────────────────────────────────


def assign_stints(df: pd.DataFrame) -> pd.DataFrame:
    """Add StintId per driver using FastF1 Stint column (dense rank, 0-indexed)."""
    if 'Stint' not in df.columns:
        raise KeyError("'Stint' column required; regenerate feature_table.csv with build_feature_table.py")
    df = df.copy()
    stint_col = df.groupby(['Year', 'Driver'])['Stint'].transform(
        lambda s: s.fillna(s.median() if s.notna().any() else 1.0)
    )
    df['StintId'] = (
        stint_col.groupby([df['Year'], df['Driver']])
        .rank(method='dense')
        .astype(int) - 1
    )
    return df


def assign_deg_severity(df: pd.DataFrame) -> pd.DataFrame:
    """
    DegSeverity 0–3 per lap.

    Base score from LapDelta (already = FuelCorrLapTime − stint best).
    Upgrades applied for sustained rolling trend or accelerating degradation.
    Last PRE_PIT_LAPS laps of a non-final stint get +1 (backward-label from pit stop).
    Final stint (highest StintId per driver/year) is excluded — it ends at the flag.
    Laps with LapDelta > OUTLIER_DELTA_CAP are flagged as -1.

    Note: InLap is always 0 in the feature table because the actual pit-in lap is
    filtered out by FastF1 (IsAccurate=False). Final-stint detection uses StintId
    relative to max StintId per driver/year instead.
    """
    df = df.copy()
    df['DegSeverity'] = 0

    # Pre-compute max stint per (year, driver) to detect the final stint
    max_stint = df.groupby(['Year', 'Driver'])['StintId'].transform('max')

    for (year, driver, stint), grp in df.groupby(['Year', 'Driver', 'StintId']):
        laps_sorted = grp.sort_values('LapNumber')
        pre_pit_idx = set(laps_sorted.index[-PRE_PIT_LAPS:])
        # Boost only fires for stints that ended with a pit stop, not the final stint
        is_final_stint = (stint == max_stint.loc[grp.index].iloc[0])

        for idx, row in grp.iterrows():
            if row['LapDelta'] > OUTLIER_DELTA_CAP:
                df.at[idx, 'DegSeverity'] = -1
                continue

            delta     = row['LapDelta']
            rolling   = row['RollingDelta3']
            deg_accel = row['DegRateAccel']

            if delta < DELTA_GRADE0:
                sev = 0
            elif delta < DELTA_GRADE1:
                sev = 1
            elif delta < DELTA_GRADE2:
                sev = 2
            else:
                sev = 3

            if rolling > ROLLING_GRADE2_THRESH:
                sev = max(sev, 2)
            # Require actual pace loss to use rate-of-change signal; guards against
            # contamination from rolling windows that span outlier laps.
            if deg_accel > DEGRATEACCEL_GRADE3 and delta > DELTA_GRADE1:
                sev = max(sev, 3)
            if idx in pre_pit_idx and not is_final_stint:
                sev = min(sev + 1, 3)

            df.at[idx, 'DegSeverity'] = sev

    return df


def assign_failure_mode(df: pd.DataFrame) -> pd.DataFrame:
    """
    FailureMode assignment.

    Priority (highest wins): graining > thermal > blistering > wear > none.
    Unreliable laps (DegSeverity == -1) override all modes.
    """
    df = df.copy()
    prd = df['PushRecoveryDelta']

    graining = (
        (df['EarlyStintConcavity'] > CONCAVITY_GRAIN) &
        (df['TyreLife'] <= TYRELIFE_EARLY) &
        (df['LapVariance'] > LAPVAR_GRAIN) &
        (df['LapDelta'] > DELTA_GRADE0)   # require observable pace loss; guards against contamination
    )
    # SLEI spike requires observable pace impact to confirm blistering is active
    # (high SLEI on fresh tires = high load, not yet blistering)
    blistering = (
        ((df['SLEI'] > SLEI_BLISTER) & (df['LapDelta'] > DELTA_GRADE0)) |
        (
            (df['TyreLife'] > TYRELIFE_LATE) &
            (df['DegRateAccel'] > DEGRATEACCEL_BLISTER) &
            (df['ThermalAccumProxy'] > THERMAL_ACCUM_BLISTER)
        )
    )
    thermal = (
        (prd < PUSH_RECOVERY_THERMAL) &
        (df['TyreLife'] <= TYRELIFE_THERMAL_MAX)
    )
    wear = (
        (df['LapDelta'] > DELTA_WEAR) &
        ~graining & ~blistering
    )

    df['FailureMode'] = 'none'
    df.loc[wear,       'FailureMode'] = 'wear'
    df.loc[blistering, 'FailureMode'] = 'blistering'
    df.loc[thermal,    'FailureMode'] = 'thermal'
    df.loc[graining,   'FailureMode'] = 'graining'
    # Fallback: pre-pit boost can push DegSeverity to 3 when LapDelta is just below DELTA_WEAR.
    # A severe lap with no assigned mode is incoherent — treat as wear.
    sev3_no_mode = (
        (df['DegSeverity'] >= 3) &
        (df['FailureMode'] == 'none') &
        (df['LapDelta'] > DELTA_GRADE0)
    )
    df.loc[sev3_no_mode, 'FailureMode'] = 'wear'
    df.loc[df['DegSeverity'] == -1, 'FailureMode'] = 'unreliable'

    return df


def print_validation_report(df: pd.DataFrame) -> None:
    print("\n=== LABEL DISTRIBUTIONS ===")
    print("DegSeverity:")
    print(df['DegSeverity'].value_counts().sort_index().to_string())
    print("\nFailureMode:")
    print(df['FailureMode'].value_counts().to_string())

    print("\n=== VALIDATION — NOR 2022 Medium stint (expected blistering near end) ===")
    nor_med = df[
        (df['Year'] == 2022) &
        (df['Driver'] == 'NOR') &
        (df['CompoundCode'] == 1) &
        (df['TyreLife'] >= 20)
    ].sort_values('TyreLife')
    print(nor_med[['LapNumber', 'TyreLife', 'LapDelta', 'SLEI',
                   'DegSeverity', 'FailureMode']].to_string(index=False))

    print("\n=== VALIDATION — severity by year / driver / stint / compound ===")
    clean = df[df['DegSeverity'] >= 0]
    pivot = (
        clean.groupby(['Year', 'Driver', 'StintId', 'CompoundCode'])['DegSeverity']
        .value_counts()
        .unstack(fill_value=0)
        .rename(columns={0: 'Gr0', 1: 'Gr1', 2: 'Gr2', 3: 'Gr3'})
    )
    print(pivot.to_string())

    print("\n=== VALIDATION — blistering laps (should include NOR long-stint end) ===")
    blister = df[df['FailureMode'] == 'blistering']
    print(blister[['Year', 'Driver', 'LapNumber', 'TyreLife', 'CompoundCode',
                   'SLEI', 'LapDelta', 'DegSeverity']].sort_values('SLEI', ascending=False).to_string(index=False))


def main():
    df = pd.read_csv(DATA_PATH)
    df['PushRecoveryDelta'] = df['PushRecoveryDelta'].fillna(0)

    df = assign_stints(df)
    df = assign_deg_severity(df)
    df = assign_failure_mode(df)

    print_validation_report(df)

    df.to_csv(OUTPUT_CSV, index=False)
    df.to_parquet(OUTPUT_PARQUET, index=False)
    label_cols = ['StintId', 'DegSeverity', 'FailureMode']
    print(f"\nSaved {len(df)} labeled laps → {OUTPUT_CSV}, {OUTPUT_PARQUET}")
    print(f"New columns: {label_cols}")


if __name__ == '__main__':
    main()
