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

```sh
python3 build.py                      # rebuild after editing src/page.html
cd test && npm install jsdom          # once
node roundtrip.test.js                # from a dir where jsdom resolves
node supply.test.js
```

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

## IR supply

A pack is meant to last a dose a day, so the reading that matters is doses
spent against days gone — the panel draws both bars against each other and the
gap between them is the finding. `irFill` marks the day a pack was opened and
how many it held; `irTaken` is that day's doses. The open pack is the most
recent refill on or before today, which means history keeps every pack rather
than only the current one, and a refill merges across devices like any other
day. The guardrail speaks only once a pack is a few days old and only when the
projection lands short — going under a dose a day is not a problem to flag.

## Schedules

A marker's `days` lists the weekdays it counts on, `0` = Sunday. Days off the
schedule are never misses, never enter the denominator, and never break a
streak — so changing a schedule never turns logged history into a miss.
