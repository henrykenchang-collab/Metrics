#!/usr/bin/env python3
"""Token-cache rules. The browser leg cannot be tested here (no network), so
everything around it is: expiry, rotation, file mode, and never leaking.

    python3 test/oura_auth.test.py
"""
import json, os, stat, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(tempfile.mkdtemp(), "oura.json")
os.environ["OURA_TOKEN_FILE"] = STORE
os.environ.pop("OURA_TOKEN", None)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import oura_auth

fails = []
def ok(cond, msg):
    print(("  PASS  " if cond else "  FAIL  ") + msg)
    if not cond:
        fails.append(msg)

posted = []
def fake_post(url, fields):
    posted.append(fields)
    return fake_post.reply
oura_auth.post_form = fake_post

BASE = {"client_id": "cid", "client_secret": "sec", "refresh_token": "R1"}

print("\n-- a valid token is reused --")
oura_auth.save(dict(BASE, access_token="A1", expires_at=time.time() + 3600))
posted.clear()
ok(oura_auth.access_token() == "A1", "returns the cached access token")
ok(not posted, "and makes no network call to do it")

print("\n-- an expired one is refreshed --")
oura_auth.save(dict(BASE, access_token="A1", expires_at=time.time() - 10))
fake_post.reply = {"access_token": "A2", "expires_in": 86400}
posted.clear()
ok(oura_auth.access_token() == "A2", "refreshes when expired")
ok(posted and posted[0]["grant_type"] == "refresh_token", "uses the refresh_token grant")
ok(posted[0]["refresh_token"] == "R1", "sends the cached refresh token")
ok(json.load(open(STORE))["access_token"] == "A2", "and saves the new one")

print("\n-- one about to expire counts as expired --")
oura_auth.save(dict(BASE, access_token="A2", expires_at=time.time() + 30))   # inside SKEW
fake_post.reply = {"access_token": "A3", "expires_in": 86400}
ok(oura_auth.access_token() == "A3", "refreshes inside the safety margin rather than racing it")

print("\n-- rotation --")
oura_auth.save(dict(BASE, access_token="A3", expires_at=0))
fake_post.reply = {"access_token": "A4", "expires_in": 86400, "refresh_token": "R2"}
oura_auth.access_token()
ok(json.load(open(STORE))["refresh_token"] == "R2", "a rotated refresh token is written back")
fake_post.reply = {"access_token": "A5", "expires_in": 86400}          # none returned
oura_auth.save(dict(json.load(open(STORE)), expires_at=0))
oura_auth.access_token()
ok(json.load(open(STORE))["refresh_token"] == "R2", "and the old one is kept when none is sent")

print("\n-- the file --")
ok(stat.S_IMODE(os.stat(STORE).st_mode) == 0o600, "cached tokens are mode 600")
ok(not STORE.startswith(ROOT), "and live outside the repo: " + os.path.dirname(STORE))
gi = open(os.path.join(ROOT, ".gitignore")).read()
ok("oura.json" in gi, "gitignore covers the token file name anyway")

print("\n-- failure modes --")
oura_auth.save({"client_id": "cid"})                                    # no refresh token
try:
    oura_auth.access_token()
    ok(False, "refuses when nothing is connected")
except oura_auth.AuthError as e:
    ok("login" in str(e), "refuses when nothing is connected, naming the fix")
oura_auth.save(dict(BASE, expires_at=0))
fake_post.reply = {"error": "invalid_grant"}                            # no access_token
try:
    oura_auth.access_token()
    ok(False, "rejects a malformed token response")
except oura_auth.AuthError as e:
    ok("access_token" in str(e), "rejects a malformed token response")

print("\n-- env override still works --")
os.environ["OURA_TOKEN"] = "legacy-pat"
ok(oura_auth.access_token() == "legacy-pat", "an existing PAT is honoured while Oura still accepts them")
os.environ.pop("OURA_TOKEN")

print("\n" + ("all passed" if not fails else "%d FAILED" % len(fails)))
sys.exit(1 if fails else 0)
