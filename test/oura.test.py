#!/usr/bin/env python3
"""Rules the Oura puller must not break.  python3 test/oura.test.py"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(ROOT, "test", "fixtures", "oura.json")
SEED = {"v": 1, "tags": [], "days": {
    "2026-08-26": {"vitamins": True, "_t": 1},
    "2026-08-27": {"sleep": 91, "th": True, "_t": 2},          # typed by hand
    "2026-08-28": {"hrv": 30, "_o": ["hrv"], "keto": True, "_t": 3},  # written by the ring
}}

fails = []
def ok(cond, msg):
    print(("  PASS  " if cond else "  FAIL  ") + msg)
    if not cond:
        fails.append(msg)

def run(seed):
    d = tempfile.mkdtemp()
    a, b = os.path.join(d, "in.json"), os.path.join(d, "out.json")
    json.dump(seed, open(a, "w"))
    out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "oura_sync.py"),
                          "--seed", a, "--fixture", FIXTURE, "--out", b, "--write"],
                         capture_output=True, text=True, check=True).stdout
    return json.load(open(b))["days"], out

days, log = run(SEED)
d26, d27, d28 = days["2026-08-26"], days["2026-08-27"], days["2026-08-28"]

print("\n-- filling blanks --")
ok(d26["sleep"] == 74 and d26["hrv"] == 39 and d26["hr"] == 55, "an empty night is filled from the ring")
ok(d26["bed"] == "22:41" and d26["wake"] == "06:12", "bed/wake come through in the ring's local time")
ok(d26["vitamins"] is True, "the rest of the day is untouched")
ok(sorted(d26["_o"]) == ["bed", "hr", "hrv", "sleep", "wake"], "provenance records the five ring fields")

print("\n-- your numbers win --")
ok(d27["sleep"] == 91, "a sleep score you typed is never overwritten (ring said 81)")
ok("sleep" not in d27["_o"], "and the ring does not claim it")
ok("kept yours" in log, "the run says out loud that it deferred to you")
ok(d27["hrv"] == 44 and d27["hr"] == 52, "blanks on that same day are still filled")

print("\n-- naps and bad values --")
ok(d27["bed"] == "21:03", "the long sleep is chosen over an afternoon nap")
ok(d28["sleep"] == 100 and "clamped" in log, "an out-of-range score is clamped, and said so")
ok(d28["hr"] == 61, "average HR is the fallback when lowest is missing")

print("\n-- correcting itself --")
ok(d28["hrv"] == 47, "a value the ring wrote before is corrected (30 -> 47)")
ok(d28["keto"] is True, "unrelated fields survive")

print("\n-- idempotence --")
again, log2 = run({"v": 1, "tags": [], "days": days})
ok(again == days, "a second run changes nothing")
ok("nothing to change" in log2, "and reports that plainly")

print("\n-- safety --")
env = dict(os.environ)
env.pop("OURA_TOKEN", None)
env["OURA_TOKEN_FILE"] = os.path.join(tempfile.mkdtemp(), "absent.json")   # no cached login
d = tempfile.mkdtemp(); p = os.path.join(d, "s.json"); json.dump(SEED, open(p, "w"))
r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "oura_sync.py"), "--seed", p],
                   capture_output=True, text=True, env=env)
out = r.stdout + r.stderr
ok(r.returncode != 0, "refuses to run when nothing is connected")
ok("oura_auth.py login" in out, "and names the command that fixes it")
ok("token" not in out.lower() or "access_token" not in out, "without printing anything secret")

print("\n" + ("all passed" if not fails else "%d FAILED" % len(fails)))
sys.exit(1 if fails else 0)
