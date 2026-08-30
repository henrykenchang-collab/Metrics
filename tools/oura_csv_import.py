#!/usr/bin/env python3
"""Fold an Oura "trends" CSV export into a Daily Readout seed.

    python3 tools/oura_csv_import.py --csv oura.csv --seed live-seed.json
    python3 tools/oura_csv_import.py --csv oura.csv --seed live-seed.json --out merged.json --write

This is the bulk-history counterpart to oura_sync.py: that tool pulls a
recent window from the live API, this one reads a CSV the user exported by
hand from the Oura app (Settings > Trends > Export). Same ownership rule
either way -- a field a day already carries and did NOT get from a previous
Oura import (no `_o` flag on it) is a number you typed, and is never
overwritten, only reported as skipped.

Column mapping, and why:
  Sleep Score               -> sleep       (unchanged field, already tracked)
  Average HRV               -> hrv         (unchanged field)
  Lowest Resting Heart Rate -> hr          (unchanged field -- oura_sync.py
                                             already prefers "lowest" over
                                             "average" for this field, so a
                                             CSV import has to match it or
                                             the two tools would silently
                                             disagree about what "hr" means)
  Average Resting Heart Rate -> avgHr      (NEW -- not the same figure as hr)
  Deep Sleep Duration        -> deepSleep  (NEW, minutes, as exported)
  REM Sleep Duration         -> remSleep   (NEW, minutes, as exported)
  Light Sleep Duration       -> lightSleep (NEW -- exported in HOURS, unlike
                                             the two fields above; converted
                                             to minutes here so all three
                                             sleep-stage fields share a unit)
  Bedtime Start / End        -> bed / wake (unchanged fields; the timestamp
                                             already carries its own local
                                             offset, so the wall-clock time
                                             is taken as printed, matching
                                             oura_sync.py's hhmm())

A row with a Sleep Score but every other column blank is kept for the score
only and flagged separately -- two such rows in this export (both a date
with no matching entry anywhere else in the file) look like a stray nap
session rather than the main night.
"""
import argparse, csv, datetime, io, json

OWNED = ("sleep", "hrv", "hr", "avgHr", "deepSleep", "remSleep", "lightSleep", "bed", "wake")
RANGE = {"sleep": (0, 100), "hrv": (0, 100), "hr": (35, 125), "avgHr": (35, 125),
         "deepSleep": (0, 600), "remSleep": (0, 600), "lightSleep": (0, 600)}


def clamp(field, value, warn, day):
    lo, hi = RANGE[field]
    if value < lo or value > hi:
        warn.append("%s: %s=%s clamped into %d-%d" % (day, field, value, lo, hi))
        return max(lo, min(hi, value))
    return value


def iso_date(mdy):
    m, d, y = mdy.split("/")
    return "%04d-%02d-%02d" % (int(y), int(m), int(d))


def hhmm(stamp):
    return datetime.datetime.fromisoformat(stamp).strftime("%H:%M")


def num(s):
    return float(s) if s not in (None, "") else None


def readings(csv_path, warn):
    out = {}
    thin = []  # rows carrying only a sleep score, nothing else
    with io.open(csv_path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if not row.get("date"):
                continue
            day = iso_date(row["date"])
            rec = {}

            score = num(row.get("Sleep Score"))
            if score is not None:
                rec["sleep"] = clamp("sleep", int(round(score)), warn, day)

            hrv = num(row.get("Average HRV"))
            if hrv is not None:
                rec["hrv"] = clamp("hrv", int(round(hrv)), warn, day)

            lowest = num(row.get("Lowest Resting Heart Rate"))
            if lowest is not None:
                rec["hr"] = clamp("hr", int(round(lowest)), warn, day)

            avg_hr = num(row.get("Average Resting Heart Rate"))
            if avg_hr is not None:
                rec["avgHr"] = clamp("avgHr", int(round(avg_hr)), warn, day)

            deep = num(row.get("Deep Sleep Duration"))
            if deep is not None:
                rec["deepSleep"] = clamp("deepSleep", int(round(deep)), warn, day)

            rem = num(row.get("REM Sleep Duration"))
            if rem is not None:
                rec["remSleep"] = clamp("remSleep", int(round(rem)), warn, day)

            light = num(row.get("Light Sleep Duration"))
            if light is not None:
                rec["lightSleep"] = clamp("lightSleep", int(round(light * 60)), warn, day)

            if row.get("Bedtime Start"):
                rec["bed"] = hhmm(row["Bedtime Start"])
            if row.get("Bedtime End"):
                rec["wake"] = hhmm(row["Bedtime End"])

            if day in out:
                warn.append("%s: duplicate row in CSV, keeping the first" % day)
                continue

            # a score with every stage at zero and no HR/HRV/times is not a
            # real night -- writing "0 min deep, 0 min REM" next to a real
            # score would misrepresent the night rather than describe it
            stages_zero = all(rec.get(f) == 0 for f in ("deepSleep", "remSleep", "lightSleep"))
            if "sleep" in rec and stages_zero and not any(f in rec for f in ("hr", "hrv", "bed", "wake")):
                rec = {"sleep": rec["sleep"]}
                thin.append(day)

            out[day] = rec
    return out, thin


def merge(seed, ring, overwrite=False):
    """overwrite=False (the default) is the oura_sync.py rule: a field a day
       already carries without an `_o` flag on it is something typed by hand,
       and is only ever reported as skipped. overwrite=True is an explicit,
       one-time exception to that rule -- the CSV wins even over a hand-typed
       value -- for when the person the data belongs to says so."""
    days = seed.setdefault("days", {})
    changes, skipped = [], []
    now = int(datetime.datetime.now().timestamp() * 1000)

    for day in sorted(ring):
        rec = days.setdefault(day, {})
        owned = set(rec.get("_o") or [])
        touched = False
        for field in OWNED:
            if field not in ring[day]:
                continue
            new = ring[day][field]
            if field in rec and field not in owned and not overwrite:
                if rec[field] != new:
                    skipped.append("%s %s: yours %s, csv says %s" % (day, field, rec[field], new))
                continue
            if rec.get(field) == new:
                continue
            changes.append("%s %s: %s -> %s" % (day, field, rec.get(field, "—"), new))
            rec[field] = new
            owned.add(field)
            touched = True
        if touched:
            rec["_o"] = sorted(owned)
            rec["_t"] = now
        elif not rec:
            del days[day]
    return seed, changes, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--seed", required=True)
    ap.add_argument("--out")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--overwrite", action="store_true",
                     help="the CSV wins even over a hand-typed value already on the day")
    args = ap.parse_args()

    warn = []
    ring, thin = readings(args.csv, warn)
    seed = json.load(io.open(args.seed, encoding="utf-8"))
    seed, changes, skipped = merge(seed, ring, overwrite=args.overwrite)

    touched_days = {c.split(" ", 1)[0] for c in changes}
    print("%d night(s) in the CSV, %d day(s) touched%s"
          % (len(ring), len(touched_days),
             ", %d field(s) skipped as hand-entered" % len(skipped) if not args.overwrite else " (overwrite: on)"))
    if warn:
        print("\nclamped or duplicate:")
        for w in warn:
            print("  " + w)
    if thin:
        print("\nsleep score only, nothing else -- probably a nap, not the main night:")
        for d in thin:
            print("  " + d)
    if skipped:
        print("\nskipped (a hand-typed value stands):")
        for s in skipped:
            print("  " + s)
    print("\nchanges:")
    for c in changes:
        print("  " + c)

    if args.write:
        out_path = args.out or args.seed
        json.dump(seed, io.open(out_path, "w", encoding="utf-8"))
        print("\nwrote %s" % out_path)
    elif args.out:
        print("\n--out given without --write: nothing written (this was a dry run)")


if __name__ == "__main__":
    main()
