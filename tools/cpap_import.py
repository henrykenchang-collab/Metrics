#!/usr/bin/env python3
"""Read a sleep therapy report PDF into Daily Readout CPAP scores.

    python3 tools/cpap_import.py report.pdf --seed live-seed.json --out merged.json

The report prints no score, so it is rebuilt here from React Health's published
100-point breakdown:

    Usage Time    60 pts   full marks past the 4-hour compliance minimum
    Mask Seal     20 pts   full marks at minimal leak, falling as leak rises
    Respiratory   20 pts   full marks below AHI 5, falling as AHI rises

Only the usage component is fully specified by that breakdown. The other two
say "deducted dynamically" and "under 5 events per hour" without naming where
the deduction reaches zero, so those endpoints are ASSUMPTIONS, set below and
nowhere else. AHI zeroes at 30 (the severe boundary) and leak at 40 L/min.
Change them here and the whole history moves together rather than splitting
into two meanings.

A night the machine went unused scores 0 outright: the report writes 0.0 into
every column for those nights, and a literal reading would hand out full marks
for a flawless AHI and a perfect seal on a machine nobody switched on.

Days the report does not cover are left exactly as they are. Everything else
already on a covered day is preserved; only `cpap` is written.

Needs pypdf. The system cryptography package can be broken, in which case:
    python3 -m venv env && ./env/bin/pip install pypdf
"""
import argparse, io, json, re, sys, time

ROW = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2})\s+(\d{1,2}):(\d{2})\s+"
                 r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+CPAP")
USAGE_PTS, USAGE_TARGET_MIN = 60, 240      # published: full marks past four hours
AHI_PTS,  AHI_FULL, AHI_ZERO = 20, 5.0, 30.0    # full marks under 5; 30 is assumed
LEAK_PTS, LEAK_FULL, LEAK_ZERO = 20, 10.0, 40.0 # full marks at or under 10; 40 is assumed


def nights(pdf_path):
    from pypdf import PdfReader
    out = {}
    for page in PdfReader(pdf_path).pages:
        for line in (page.extract_text() or "").split("\n"):
            m = ROW.match(line.strip())
            if not m:
                continue
            mo, dd, yy, hh, mi = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
            out["20%s-%02d-%02d" % (yy, int(mo), int(dd))] = {
                "usedMin": int(hh) * 60 + int(mi),
                "ahi": float(m.group(7)), "leak": float(m.group(10)),
            }
    return out


def taper(value, full_at, zero_at, points):
    """Full marks at or below `full_at`, none at or above `zero_at`, straight
    line between. The shape the breakdown describes as deducted dynamically."""
    if value <= full_at:
        return float(points)
    if value >= zero_at:
        return 0.0
    return points * (1.0 - (value - full_at) / float(zero_at - full_at))


def parts(night):
    if night["usedMin"] <= 0:
        return 0.0, 0.0, 0.0          # nothing ran; the zeroed columns are placeholders
    usage = USAGE_PTS * min(1.0, night["usedMin"] / float(USAGE_TARGET_MIN))
    return (usage,
            taper(night["ahi"], AHI_FULL, AHI_ZERO, AHI_PTS),
            taper(night["leak"], LEAK_FULL, LEAK_ZERO, LEAK_PTS))


def score(night):
    return int(round(sum(parts(night))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--seed", required=True, help="the tracker's current seed JSON")
    ap.add_argument("--out", help="where to write the merged seed")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    data = nights(args.pdf)
    if not data:
        sys.exit("no nightly rows found — is this the usage report, or a summary only?")

    seed = json.load(io.open(args.seed, encoding="utf-8"))
    days = seed.setdefault("days", {})
    now = int(time.time() * 1000)
    made = changed = 0

    for k in sorted(data):
        s = score(data[k])
        d = days.get(k)
        if d is None:
            days[k] = {"cpap": s, "_t": now}
            made += 1
        elif d.get("cpap") != s:
            print("  %s  %s -> %s" % (k, d.get("cpap", "—"), s))
            d["cpap"] = s
            d["_t"] = now
            changed += 1

    used = [k for k in data if data[k]["usedMin"] > 0]
    print("%d nights, %s to %s" % (len(data), min(data), max(data)))
    print("  %d used, %d not; %d at or above four hours"
          % (len(used), len(data) - len(used),
             len([k for k in used if data[k]["usedMin"] >= USAGE_TARGET_MIN])))
    print("  %d days created, %d rescored" % (made, changed))

    if args.out and args.write:
        json.dump(seed, io.open(args.out, "w", encoding="utf-8"), separators=(",", ":"))
        print("wrote %s (%d days)" % (args.out, len(days)))
    else:
        print("(dry run — pass --out FILE --write to apply)")


if __name__ == "__main__":
    main()
