#!/usr/bin/env python3
"""Pull sleep figures from an Oura ring into a Daily Readout seed.

    export OURA_TOKEN=...                 # never on the command line
    python3 tools/oura_sync.py --seed live-seed.json            # dry run
    python3 tools/oura_sync.py --seed live-seed.json --out merged.json --write

Oura owns five fields: sleep, hrv, hr, bed, wake. It never overwrites a figure
you typed. Each day records which fields came from the ring (`_o`), so a later
run may correct its OWN values while leaving a hand-entered one alone forever
-- if you edited a night by hand, you meant it.

The field mapping below is written against Oura's documented v2 shapes but has
NOT been checked against a real response, so every field is validated and the
run fails loudly rather than writing a number it is unsure of. Look at a dry
run before trusting it.
"""
import argparse, datetime, json, os, sys, urllib.error, urllib.request

BASE = "https://api.ouraring.com/v2/usercollection/"
OWNED = ("sleep", "hrv", "hr", "bed", "wake")
# the tracker clamps these on entry; clamp here too so the two never disagree
RANGE = {"sleep": (0, 100), "hrv": (0, 100), "hr": (35, 125)}


class OuraError(RuntimeError):
    pass


def fetch(path, token, start, end):
    url = "%s%s?start_date=%s&end_date=%s" % (BASE, path, start, end)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        hint = {401: "token rejected — check OURA_TOKEN",
                403: "token lacks scope for " + path,
                429: "rate limited — try later"}.get(e.code, "")
        raise OuraError("%s: HTTP %d %s" % (path, e.code, hint))
    except urllib.error.URLError as e:
        raise OuraError("%s: cannot reach Oura (%s). If this is a 403 CONNECT, "
                        "the environment's network policy still blocks "
                        "api.ouraring.com." % (path, e.reason))
    if not isinstance(body.get("data"), list):
        raise OuraError("%s: response has no data list — shape has changed" % path)
    return body["data"]


def hhmm(stamp):
    """'2026-08-26T21:03:12-07:00' -> '21:03', in the ring's own local time."""
    try:
        return datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00")).strftime("%H:%M")
    except (ValueError, AttributeError):
        raise OuraError("cannot read timestamp %r" % (stamp,))


def main_sleep(periods):
    """The night's long sleep, not a nap: prefer type long_sleep, else longest."""
    ranked = sorted(periods,
                    key=lambda p: (p.get("type") == "long_sleep",
                                   p.get("total_sleep_duration") or 0),
                    reverse=True)
    return ranked[0] if ranked else None


def clamp(field, value, warn):
    lo, hi = RANGE[field]
    if value < lo or value > hi:
        warn.append("%s=%s clamped into %d–%d" % (field, value, lo, hi))
        return max(lo, min(hi, value))
    return value


def readings(token, start, end, warn):
    """{'2026-08-27': {'sleep':81,'hrv':44,'hr':52,'bed':'21:03','wake':'05:14'}}"""
    out = {}

    for row in fetch("daily_sleep", token, start, end):
        day, score = row.get("day"), row.get("score")
        if not day:
            continue
        if isinstance(score, (int, float)):
            out.setdefault(day, {})["sleep"] = clamp("sleep", int(round(score)), warn)
        else:
            warn.append("%s: daily_sleep had no score" % day)

    by_day = {}
    for row in fetch("sleep", token, start, end):
        if row.get("day"):
            by_day.setdefault(row["day"], []).append(row)

    for day, periods in by_day.items():
        p = main_sleep(periods)
        if not p:
            continue
        rec = out.setdefault(day, {})
        hrv = p.get("average_hrv")
        if isinstance(hrv, (int, float)):
            rec["hrv"] = clamp("hrv", int(round(hrv)), warn)
        hr = p.get("lowest_heart_rate")
        if not isinstance(hr, (int, float)):
            hr = p.get("average_heart_rate")
        if isinstance(hr, (int, float)):
            rec["hr"] = clamp("hr", int(round(hr)), warn)
        if p.get("bedtime_start"):
            rec["bed"] = hhmm(p["bedtime_start"])
        if p.get("bedtime_end"):
            rec["wake"] = hhmm(p["bedtime_end"])

    return out


def merge(seed, ring):
    """Fold ring readings into a seed. Returns (seed, changes, skipped)."""
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
            if field in rec and field not in owned:
                if rec[field] != new:
                    skipped.append("%s %s: yours %s, ring says %s" % (day, field, rec[field], new))
                continue                      # a figure you typed is final
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
            del days[day]                     # nothing to say about this day
    return seed, changes, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", required=True, help="the tracker's current seed JSON")
    ap.add_argument("--out", help="where to write the merged seed")
    ap.add_argument("--days", type=int, default=7, help="how far back to pull (default 7)")
    ap.add_argument("--write", action="store_true", help="actually write --out")
    ap.add_argument("--fixture", help="read Oura payloads from a file instead of the API (testing)")
    args = ap.parse_args()

    seed = json.load(open(args.seed, encoding="utf-8"))
    if not isinstance(seed.get("days"), dict):
        sys.exit("seed has no days object — wrong file?")

    end = datetime.date.today()
    start = end - datetime.timedelta(days=args.days)
    warn = []

    if args.fixture:
        fx = json.load(open(args.fixture, encoding="utf-8"))
        global fetch
        fetch = lambda path, *a, **k: fx.get(path, [])
        ring = readings("fixture", str(start), str(end), warn)
    else:
        token = os.environ.get("OURA_TOKEN")
        if not token:
            sys.exit("OURA_TOKEN is not set. Put it in the environment's variables, "
                     "never on the command line or in a file.")
        ring = readings(token, str(start), str(end), warn)

    seed, changes, skipped = merge(seed, ring)

    print("%d night(s) from the ring, %s to %s" % (len(ring), start, end))
    for w in warn:
        print("  ! " + w)
    for s in skipped:
        print("  = kept yours — " + s)
    for c in changes:
        print("  + " + c)
    if not changes:
        print("  nothing to change")

    if args.out and args.write:
        json.dump(seed, open(args.out, "w", encoding="utf-8"), separators=(",", ":"))
        print("wrote %s" % args.out)
    elif changes:
        print("(dry run — pass --out FILE --write to apply)")


if __name__ == "__main__":
    main()
