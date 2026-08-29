# Metrics

Source for **Daily Readout**, a habit / sleep / biometric tracker published as a
Claude Artifact. One page, no build tooling beyond a single Python script.

## Layout

| path | what it is |
| --- | --- |
| `src/page.html` | the page itself — styles, markup, app script. **Edit this.** |
| `build.py` | wraps `src/page.html` into the publishable file |
| `daily-readout.html` | generated; the file that gets published. Do not edit by hand |
| `test/roundtrip.test.js` | jsdom tests, mostly guarding the self-republish |
| `test/supply.test.js` | jsdom tests for the IR pack arithmetic |
| `.claude/commands/oura-sync.md` | `/oura-sync` — the whole pull-and-publish loop |
| `tools/oura_auth.py` | OAuth2 against Oura, run on your own machine |
| `tools/oura_sync.py` | pulls sleep figures from an Oura ring into a seed |
| `test/oura.test.py` | rules the puller must not break |
| `test/oura_auth.test.py` | token cache: expiry, rotation, file mode |

```sh
python3 build.py                      # rebuild after editing src/page.html
cd test && npm install jsdom          # once
node roundtrip.test.js                # from a dir where jsdom resolves
node supply.test.js
```

## Publishing without losing the log

The built file in this repo always carries an **empty** seed, so no health data
lands in git. The live log therefore exists only in the published artifact —
which means a republish has to carry it forward:

1. Read the live page's `id="seed"` block (unescape `<\/` back to `</`).
2. `python3 build.py --seed live.json -o publish.html`
3. Publish `publish.html`.

Publishing the repo's `daily-readout.html` directly wipes every logged day.
The publish path refuses a stale write, so a page that saved itself since your
last publish will reject the call rather than let it clobber — merge the seed
it hands back and publish again.

## How saving works

The log lives in two places. `localStorage` is the instant local copy: edits land
there first, so the page works with no signal. The artifact itself carries the
shared copy, embedded as a JSON seed in the published HTML — which is why opening
the page on another device shows the same days.

Saving means the page republishes itself through the `artifact` capability. To do
that it needs its own source, so the built file carries the page twice: once
base64'd inside a `text/plain` template block, once as the live page. A save
re-emits that block verbatim and changes only the seed, so the page cannot drift
from itself — `test/roundtrip.test.js` asserts exactly that, and that a second
save reproduces the same bytes.

Base64 rather than escaping `</script`, because escaping could not round-trip
here: the escaping code would itself be part of the page being escaped, so
decoding would rewrite the very sequences it defines.

Days merge one at a time, newest write per day winning (`_t` is the per-day
stamp). Two devices working on different days never cost each other anything;
the same day on two devices resolves to whichever was written last.

## IR and XR supply

What is left is a matter of the calendar, not of counting: a refill covers a
fixed run of days, so the date it happened is the only input. `refill` holds
that date on the day it was entered, and the one in force is the last recorded
on or before today — so editing today's corrects an older entry, which is what
correcting a date should do.

`IR_DAYS` is 30, `XR_DAYS` 60. The panel draws what is left of each against its
span and names both run-out dates; the guardrail speaks at `LOW_DAYS` (7) and
again at zero. `irTaken` still records the day's doses, but no longer drives the
projection.

`irFill`, the old pack-size field, is gone from the interface. Days that carry
one keep it in storage, unread — nothing written is ever deleted.

## Schedules

A marker's `days` lists the weekdays it counts on, `0` = Sunday. Days off the
schedule are never misses, never enter the denominator, and never break a
streak — so changing a schedule never turns logged history into a miss.
