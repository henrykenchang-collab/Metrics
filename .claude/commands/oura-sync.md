---
description: Pull last night's Oura figures into the Daily Readout artifact
---

Sync the Oura ring into the Daily Readout. Run from a clone of this repo on a
machine where `python3 tools/oura_auth.py status` reports a cached login.

The artifact is the source of truth for the log; this repo is the source of
truth for the page. A publish has to combine the two, so do not skip step 2.

**1. Get the live log.**
Read the artifact at
https://claude.ai/code/artifact/3031fbe4-0f7e-47e7-af31-e45adc7483b6
and extract the contents of its `id="seed"` script block, replacing `<\/` with
`</`. Save it as `live-seed.json` (gitignored — never commit it, it is health
data).

**2. Check the page has not drifted.**
Base64-decode the artifact's `id="tpl"` block and compare it to
`src/page.html` at HEAD. They must be identical. If they differ, the artifact
is running code this checkout does not have, or vice versa — stop and tell the
user which, rather than publishing and losing one of them.

**3. Dry run.**
```sh
python3 tools/oura_sync.py --seed live-seed.json --days 7
```
Show the user the output verbatim. It prints every value it would write, every
place it deferred to a hand-typed number, and any clamping. Do not proceed on
your own judgement — wait for them to confirm the numbers look right.

If it fails to reach Oura, the endpoints in `tools/oura_auth.py` are unverified
guesses from Oura's docs; report the error and offer to correct
`OURA_AUTH_URL` / `OURA_TOKEN_URL` rather than retrying blindly.

**4. Apply and publish.**
```sh
python3 tools/oura_sync.py --seed live-seed.json --out merged.json --write
python3 build.py --seed merged.json -o publish.html
```
Publish `publish.html` to the artifact URL above, passing it as `url` so it
updates in place. Do not pass `capabilities` — the stored declaration carries
forward. Use a short label such as `oura-<date>`.

**5. Report.**
Say which nights changed and which fields. If the publish is refused because
the page saved itself while you worked, that is routine: re-read the seed, redo
from step 3 with the newer log, and publish again. Never use `force`.

**Never:** commit `live-seed.json`, `merged.json` or `publish.html`; print a
token; or overwrite a field the dry run reported as hand-entered.
