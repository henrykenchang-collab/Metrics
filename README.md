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
| `tools/cpap_import.py` | a sleep therapy report PDF into CPAP scores |
| `tools/oura_auth.py` | OAuth2 against Oura, run on your own machine |
| `tools/oura_sync.py` | pulls sleep figures from an Oura ring into a seed |
| `test/oura.test.py` | rules the puller must not break |
| `test/meals.test.js` | the meals section, CPAP zeros, the weekend rule |
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
on or before today — so editing today's corrects an older entry.

The refill day itself counts as a full span, because that day's dose came out
of the previous refill. Refill on the 1st and IR reads 30 that day, 29 on the
2nd, 0 on the 31st — which is the **last day it covers**, not the first day
without. The copy says "lasts through" for exactly that reason.

`IR_DAYS` is 30, `XR_DAYS` 60, and the guardrail speaks at `LOW_DAYS` (7) and
again on the last day.

`irTaken` and `irFill` are both gone from the interface. Days that carry them
keep them in storage, unread — nothing written is ever deleted.

## Folding panels

Every `section.panel` folds from its header. The body wrapper is built at boot
from whatever follows the head rather than written into the markup, so a new
panel folds without being told to.

Which panels are shut is a per-device convenience, not part of the log: it
lives under its own `dailyReadout.shut` key, so it never enters the seed, never
syncs, and never counts as a day's content.

The month arrows sit inside a head, so they stop the click from reaching it —
stepping months is not folding. The label between them still folds.

## Defaults the app applies for you

Three things get filled in on your behalf, and each is flagged so that undoing
whatever summoned it takes it with it — a default must never be the thing that
keeps an otherwise-empty day alive:

- bed and wake (`_df`), cleared the moment you touch either
- work productivity at the weekend, set to N/A (`_dw`), cleared the moment you
  choose anything for it
- an empty meal row, which is not stored at all until it has text

`entered()` is the single place that knows the difference between something you
put there and something the app assumed.

## CPAP

The therapy report prints no score, so it is rebuilt from React Health's
published 100-point breakdown:

| Component | Points | Full marks |
| --- | --- | --- |
| Usage time | 60 | past the 4-hour compliance minimum |
| Mask seal (leak) | 20 | at minimal leak |
| Respiratory (AHI) | 20 | below AHI 5 |

Only usage is fully specified there. The other two say "deducted dynamically"
and "under 5 events per hour" without naming where the deduction reaches zero,
so those endpoints are **assumptions**: AHI zeroes at 30, the severe boundary,
and leak at 40 L/min. Both are named constants at the top of
`tools/cpap_import.py` and appear nowhere else, so moving one moves the whole
history together rather than splitting it into two meanings.

A night the machine went unused scores 0 outright. The report writes 0.0 into
every column for those nights, and reading them literally would award full
marks for a flawless AHI and a perfect seal on a machine nobody switched on.

A zero draws red in the month grid, because a night unused is the one CPAP
value worth seeing across a month.

## Doses

`Extra/Under IR` and `Extra/Under XR` are signed: a positive is an extra dose,
a negative one skipped, so the field reads as net deviation from the usual
rather than as an amount taken. Only fields marked `signed` accept a minus —
a sleep score or a heart rate still refuses one. A lone `-` is allowed to sit
in the field so the next keystroke can finish `-20`, but nothing is stored
until a digit lands.

## Schedules

A marker's `days` lists the weekdays it counts on, `0` = Sunday. Days off the
schedule are never misses, never enter the denominator, and never break a
streak — so changing a schedule never turns logged history into a miss.
