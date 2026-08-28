#!/usr/bin/env python3
"""OAuth2 for Oura, run on your own machine.

Oura retired Personal Access Tokens, so a long-lived secret is no longer on
offer: what you get is a refresh token that must be kept and, if Oura rotates
it, written back. That is precisely why this belongs on your laptop and not in
a cloud environment -- a rotated token needs somewhere durable to land.

    python3 tools/oura_auth.py login      # once, opens a browser
    python3 tools/oura_auth.py status     # what is cached, without printing it

Tokens live in ~/.config/daily-readout/oura.json, mode 600, outside the repo so
they cannot be committed by accident. Nothing here ever prints a secret.

ENDPOINTS ARE UNVERIFIED. This machine cannot reach Oura to check them, so the
two URLs below come from Oura's published OAuth2 documentation and have not
been exercised. If either is wrong the error will say so plainly, and both can
be corrected without touching code:

    export OURA_AUTH_URL=...    OURA_TOKEN_URL=...
"""
import http.server, json, os, secrets, stat, sys, threading, time
import urllib.error, urllib.parse, urllib.request, webbrowser

AUTH_URL = os.environ.get("OURA_AUTH_URL", "https://cloud.ouraring.com/oauth/authorize")
TOKEN_URL = os.environ.get("OURA_TOKEN_URL", "https://api.ouraring.com/oauth/token")
SCOPES = os.environ.get("OURA_SCOPES", "daily heartrate personal")
PORT = int(os.environ.get("OURA_PORT", "8723"))
REDIRECT = "http://localhost:%d/callback" % PORT

STORE = os.path.expanduser(os.environ.get(
    "OURA_TOKEN_FILE", "~/.config/daily-readout/oura.json"))
SKEW = 120          # refresh this many seconds before expiry


class AuthError(RuntimeError):
    pass


# --- the token file ---------------------------------------------------------

def load():
    try:
        with open(STORE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        raise AuthError("cannot read %s (%s). Delete it and log in again." % (STORE, e))


def save(data):
    d = os.path.dirname(STORE)
    if d:
        os.makedirs(d, exist_ok=True)
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)      # 600 before it takes the real name
    os.replace(tmp, STORE)


def post_form(url, fields):
    """POST application/x-www-form-urlencoded, return parsed JSON."""
    body = urllib.parse.urlencode(fields).encode("ascii")
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise AuthError("token endpoint %s returned HTTP %d: %s\n"
                        "If this is a 404, OURA_TOKEN_URL is wrong for your account."
                        % (url, e.code, detail))
    except urllib.error.URLError as e:
        raise AuthError("cannot reach %s (%s)" % (url, e.reason))


def store_grant(grant, keep):
    """Fold a token response into the cache. Rotation-safe: a refresh_token is
    replaced when Oura sends a new one and preserved when it does not."""
    if "access_token" not in grant:
        raise AuthError("token response had no access_token: %s" % sorted(grant))
    out = dict(keep)
    out["access_token"] = grant["access_token"]
    out["expires_at"] = int(time.time()) + int(grant.get("expires_in", 86400))
    if grant.get("refresh_token"):
        out["refresh_token"] = grant["refresh_token"]
    elif not out.get("refresh_token"):
        raise AuthError("no refresh token, now or cached — re-run `login`")
    return out


# --- the one-time browser step ---------------------------------------------

class Catcher(http.server.BaseHTTPRequestHandler):
    result = {}

    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        Catcher.result = {k: v[0] for k, v in q.items()}
        ok = "code" in Catcher.result
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(("<h2>%s</h2><p>%s</p>" % (
            "Connected." if ok else "Something went wrong.",
            "You can close this tab and go back to the terminal."
            if ok else "Oura said: " + (Catcher.result.get("error") or "no code")
        )).encode("utf-8"))

    def log_message(self, *a):
        pass                                    # a local callback is not news


def login(client_id, client_secret):
    state = secrets.token_urlsafe(24)
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": client_id,
        "redirect_uri": REDIRECT, "scope": SCOPES, "state": state})

    srv = http.server.HTTPServer(("127.0.0.1", PORT), Catcher)
    srv.timeout = 180
    threading.Thread(target=srv.handle_request, daemon=True).start()

    print("Approve access in the browser window that just opened.")
    print("If it did not open, paste this in yourself:\n\n  %s\n" % url)
    try:
        webbrowser.open(url)
    except Exception:
        pass

    deadline = time.time() + 180
    while not Catcher.result and time.time() < deadline:
        time.sleep(0.3)
    srv.server_close()

    got = Catcher.result
    if not got:
        raise AuthError("no redirect arrived within 3 minutes. Is %s registered "
                        "as the application's redirect URI?" % REDIRECT)
    if got.get("error"):
        raise AuthError("Oura refused: %s" % got["error"])
    if got.get("state") != state:
        raise AuthError("state did not match — abandoning, this could be a forgery")

    grant = post_form(TOKEN_URL, {
        "grant_type": "authorization_code", "code": got["code"],
        "redirect_uri": REDIRECT, "client_id": client_id,
        "client_secret": client_secret})

    save(store_grant(grant, {"client_id": client_id, "client_secret": client_secret}))
    print("Connected. Tokens cached in %s (mode 600)." % STORE)


# --- what oura_sync.py calls ------------------------------------------------

def access_token(now=None):
    """A usable access token, refreshing and re-saving if it has aged out."""
    env = os.environ.get("OURA_TOKEN")
    if env:
        return env                              # an old PAT, while they still work
    data = load()
    if not data.get("refresh_token"):
        raise AuthError("not connected yet — run: python3 tools/oura_auth.py login")
    now = now if now is not None else time.time()
    if data.get("access_token") and data.get("expires_at", 0) - SKEW > now:
        return data["access_token"]
    grant = post_form(TOKEN_URL, {
        "grant_type": "refresh_token", "refresh_token": data["refresh_token"],
        "client_id": data.get("client_id", ""), "client_secret": data.get("client_secret", "")})
    data = store_grant(grant, data)
    save(data)
    return data["access_token"]


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "login":
        cid = os.environ.get("OURA_CLIENT_ID") or input("Client ID: ").strip()
        sec = os.environ.get("OURA_CLIENT_SECRET") or input("Client secret: ").strip()
        if not cid or not sec:
            sys.exit("both a client ID and secret are needed")
        login(cid, sec)
    elif cmd == "status":
        d = load()
        if not d:
            print("not connected — run: python3 tools/oura_auth.py login")
            return
        left = int(d.get("expires_at", 0) - time.time())
        print("store        %s" % STORE)
        print("mode         %o" % (os.stat(STORE).st_mode & 0o777))
        print("client id    %s" % ("set" if d.get("client_id") else "MISSING"))
        print("refresh tok  %s" % ("cached" if d.get("refresh_token") else "MISSING"))
        print("access tok   %s" % ("valid, %dm left" % (left // 60) if left > 0 else "expired, will refresh"))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    try:
        main()
    except AuthError as e:
        sys.exit("oura-auth: %s" % e)
