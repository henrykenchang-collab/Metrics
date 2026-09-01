/* Rain on Walk with Shanti: a day the walk could not be asked for, as
   opposed to one that was skipped. It makes the day not due, and not-due is
   the app's single definition of "does not count" -- so this checks the day
   drops out of every place a miss would otherwise register, and that the
   other N/As (a rating marked N/A, a weekend, a holiday) drop out the same
   way. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
let copied = "";

// pinned mid-month, so days a few back are inside the grid being drawn
const NOW = (() => { const d = new Date(); if (d.getDate() <= 7) { d.setDate(0); d.setDate(20); } return d; })();
const TODAY = iso(NOW);
const back = n => shift(TODAY, -n);

function open(jar) {
  jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      const R = w.Date, f = TODAY + "T12:00:00";
      function F(...a) { return a.length ? new R(...a) : new R(f); }
      F.prototype = R.prototype; F.now = () => new R(f).getTime(); F.parse = R.parse; F.UTC = R.UTC; w.Date = F;
      Object.defineProperty(w.navigator, "clipboard", { value: { writeText: t => { copied = t; return Promise.resolve(); } }, configurable: true });
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const row = (w, code) => [...w.document.querySelectorAll("#rows > *, #petrows > *")]
  .find(b => b.querySelector(".row-code").textContent === code);
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const day = (c, k) => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[k] || {};

console.log("\n-- the control --");
let c = open({});
const wlk = row(c.w, "WLK");
const rain = wlk.querySelector(".excuse");
ok(!!rain, "Walk with Shanti carries an excuse control");
ok(rain.textContent === "Rain", "labelled Rain: " + rain.textContent);
ok(rain.tagName.toLowerCase() === "button", "it is a real button");
ok(c.w.document.querySelectorAll(".excuse").length === 1, "and it is the only one -- no other marker grew one");

console.log("\n-- excusing is not doing --");
click(c.w, rain);
ok(day(c, TODAY).walkRain === true, "Rain records");
ok(day(c, TODAY).walkpm === undefined, "and the walk itself stays untouched");
ok(row(c.w, "WLK").querySelector(".excuse").getAttribute("aria-pressed") === "true", "the control reads pressed");
ok(row(c.w, "WLK").classList.contains("notdue"), "the row now reads not due");
click(c.w, row(c.w, "WLK").querySelector(".excuse"));
ok(day(c, TODAY).walkRain === undefined, "clicking it again clears it");
ok(!row(c.w, "WLK").classList.contains("notdue"), "and the walk is due again");
// the row underneath still toggles the walk
click(c.w, row(c.w, "WLK"));
ok(day(c, TODAY).walkpm === true, "tapping the row still records the walk");

console.log("\n-- a rained-off day counts nowhere --");
// six days walked, except one in the middle that was missed. Run it twice --
// once where that day was rained off, once where it just was not walked --
// so the rain is the only thing that differs and the streak isolates it.
const runOf = excused => {
  const seed = {};
  for (let i = 0; i <= 5; i++) seed[back(i)] = { walkpm: true, vitamins: true, _t: 1 };
  seed[back(3)] = { vitamins: true, _t: 1 };                       // not walked
  if (excused) seed[back(3)].walkRain = true;
  const o = open({ "dailyReadout.v1": JSON.stringify(seed) });
  return { w: o.w, n: +row(o.w, "WLK").querySelector(".streak").textContent.replace("d", "") };
};
const rained = runOf(true), plain = runOf(false);
const r = rained;
ok(rained.n > plain.n,
   "the streak steps over a rained-off day but breaks on a plain miss: " + rained.n + "d vs " + plain.n + "d");
ok(plain.n <= 3, "the plain miss really does stop it: " + plain.n + "d");
ok(!/Walk with Shanti/.test(r.w.document.getElementById("guard").textContent),
   "no guardrail miss: " + r.w.document.getElementById("guard").textContent.slice(0, 100));

console.log("\n-- layout: the streak sits on the left, the excuse by the checkbox --");
{
  const x = open({});
  const kids = [...row(x.w, "WLK").children].map(el => el.className);
  const iCode = kids.findIndex(c2 => /\brow-code\b/.test(c2));
  const iStreak = kids.findIndex(c2 => /\bstreak\b/.test(c2));
  const iName = kids.findIndex(c2 => /\brow-name\b/.test(c2));
  const iExcuse = kids.findIndex(c2 => /\bexcuse\b/.test(c2));
  const iCell = kids.findIndex(c2 => /\bcell\b/.test(c2));
  ok(iCode < iStreak && iStreak < iName, "code, then streak, then the name: " + kids.join(" | "));
  ok(iExcuse === iCell - 1, "and the excuse sits directly before the checkbox: " + kids.join(" | "));
  // a marker with no excuse keeps the same left-to-right code/streak/name/cell shape
  const plain = [...row(x.w, "GYM").children].map(el => el.className);
  const pStreak = plain.findIndex(c2 => /\bstreak\b/.test(c2)), pName = plain.findIndex(c2 => /\brow-name\b/.test(c2));
  ok(pStreak < pName, "true of an ordinary row too, not just the one with an excuse: " + plain.join(" | "));
}

console.log("\n-- Rain is orange, in both states --");
{
  const css = HTML.replace(/\s+/g, " ");
  const off = css.match(/\.excuse \{[^}]*\}/)[0];
  ok(/color: var\(--copper\)/.test(off) && /border: 1px dashed var\(--copper\)/.test(off),
     "unpressed: copper outline, not the neutral grey N/A wears: " + off);
  const on = css.match(/\.excuse\[aria-pressed="true"\] \{[^}]*\}/)[0];
  ok(/background: var\(--copper\)/.test(on) && /border-color: var\(--copper\)/.test(on),
     "pressed: filled copper, not grey: " + on);
}

console.log("\n-- the excuse replaces the Not Due pill rather than sitting beside it --");
{
  const x = open({});
  const r2 = () => row(x.w, "WLK");
  const tag = () => r2().querySelector(".streak");
  ok(tag().hidden === false, "the streak pill is there to begin with");
  click(x.w, r2().querySelector(".excuse"));
  ok(tag().hidden === true,
     "excused, it goes -- the lit Rain already says not due, and two pills wrap the name");
  click(x.w, r2().querySelector(".excuse"));
  ok(tag().hidden === false, "and comes back when the excuse is lifted");
  ok(tag().textContent.endsWith("d"), "reading a streak again: " + tag().textContent);
}

console.log("\n-- and it reads N/A in the month table --");
const sq = (w, k, code) => w.document.getElementById("grid")
  .querySelector('.sq[data-d="' + k + '"][title^="' + code + '"]');
ok(sq(r.w, back(3), "WLK").classList.contains("na"),
   "the rained-off square is ghosted: " + sq(r.w, back(3), "WLK").className);
ok(!sq(r.w, back(2), "WLK").classList.contains("na"), "a walked day is not");

console.log("\n-- the same for the other N/As --");
{
  // a weekend: Walk with Shanti is Not Sat, so a Saturday is already not due
  const sat = (() => { let k = TODAY; while (new Date(k + "T12:00:00").getDay() !== 6) k = shift(k, -1); return k; })();
  const s2 = {}; s2[sat] = { vitamins: true, _t: 1 };
  const w2 = open({ "dailyReadout.v1": JSON.stringify(s2) });
  ok(sq(w2.w, sat, "WLK").classList.contains("na"), "an unscheduled Saturday is ghosted too");
}
{
  // a rating marked N/A must not enter its own guardrail trend or Patterns
  const s3 = {};
  for (let i = 0; i < 7; i++) s3[back(i)] = { work: "na", fluency: "na", vitamins: true, _t: 1 };
  for (let i = 7; i < 14; i++) s3[back(i)] = { work: 5, fluency: "good", vitamins: true, _t: 1 };
  const w3 = open({ "dailyReadout.v1": JSON.stringify(s3) });
  const g = w3.w.document.getElementById("guard").textContent;
  ok(!/Work Productivity/.test(g), "a week of N/A work is not a collapse in Work Productivity: " + g.slice(0, 90));
  ok(!/Verbal Fluency/.test(g), "nor in Verbal Fluency");
}

console.log("\n-- Patterns stops treating a not-due day as a day without --");
{
  // walk on every scheduled day; the only days without it are Saturdays and
  // rained-off days, which must not form the comparison's "without" side
  const s4 = {};
  for (let i = 0; i < 40; i++) {
    const k = back(i), sat = new Date(k + "T12:00:00").getDay() === 6;
    s4[k] = { ePre: 4, vitamins: true, _t: 1 };
    if (!sat) s4[k].walkpm = true;
  }
  const w4 = open({ "dailyReadout.v1": JSON.stringify(s4) });
  const names = [...w4.w.document.querySelectorAll("#facts .fact-name")].map(e => e.textContent);
  ok(!names.some(n => n.indexOf("Walk with Shanti") >= 0),
     "with every due day walked there is no without-side left, so it drops out rather than comparing against Saturdays: " +
     names.slice(0, 5).join(" | "));
}

console.log("\n-- the export says N/A, not a miss --");
const e = open({ "dailyReadout.v1": JSON.stringify({
  [back(2)]: { walkpm: true, vitamins: true, _t: 1 },
  [back(1)]: { walkRain: true, vitamins: true, _t: 1 } }) });
e.w.document.getElementById("copyBtn").dispatchEvent(new e.w.MouseEvent("click", { bubbles: true }));
setTimeout(() => {
  const head = copied.split("\n")[0].split(",");
  const col = head.indexOf("Walk with Shanti (PM)");
  const cell = k => (copied.split("\n").find(l => l.indexOf(k) === 0) || "").split(",")[col];
  ok(col >= 0, "the walk has an export column");
  ok(cell(back(2)) === "Yes", "the day it happened reads Yes: " + cell(back(2)));
  ok(cell(back(1)) === "N/A", "the rained-off day reads N/A, not No: " + cell(back(1)));
  console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
  process.exit(fail ? 1 : 0);
}, 150);
