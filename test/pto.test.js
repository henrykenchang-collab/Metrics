/* PTO: not a marker of its own, but a button next to every marker, the same
   shape as Rain on Walk with Shanti -- a day that one marker specifically
   could not be asked for. Each marker's PTO excuse is independent: tapping
   it on Gym does not touch Keto's due-ness that same day. Everything an
   excuse already does for Rain (drop out of the streak, the readout, the
   guardrails, the month table and the export) is exercised generically by
   test/excuse.test.js against the same isDue() path; this file checks the
   PTO-specific wiring: every row grows the control, it is keyed per marker,
   and it stays independent from marker to marker. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
const NOW = (() => { const d = new Date(); if (d.getDate() <= 10) { d.setDate(0); d.setDate(20); } return d; })();
const TODAY = iso(NOW);
const back = n => shift(TODAY, -n);
let copied = "";

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
const row = (w, code) => [...w.document.querySelectorAll("#rows > .row, #petrows > .row")]
  .find(b => b.querySelector(".row-code").textContent === code);
const pto = (w, code) => row(w, code).querySelector(".excuse.pto");
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const day = (c, k) => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[k] || {};

console.log("\n-- every marker grows one, except Shanti and Buddha's own panel --");
{
  const c = open({});
  ["VIT", "KET", "GYM"].forEach(code => {
    const btn = pto(c.w, code);
    ok(!!btn, code + " carries a PTO control");
    ok(btn.textContent === "PTO", "labelled PTO: " + btn.textContent);
  });
  ["WLK", "BUD", "SHA"].forEach(code => {
    ok(!pto(c.w, code), code + " opts out -- no work-vacation concept in Shanti and Buddha's panel");
  });
  ok(c.w.document.querySelectorAll("#rows > .row").length ===
     c.w.document.querySelectorAll(".excuse.pto").length,
     "one PTO control per Daily Markers row, and none in petrows");
}

console.log("\n-- excusing is not doing, and it clears the same way --");
{
  const c = open({});
  click(c.w, pto(c.w, "KET"));
  ok(day(c, TODAY).ketoPto === true, "records under the marker's own key");
  ok(day(c, TODAY).keto === undefined, "and the checkbox itself stays untouched");
  ok(pto(c.w, "KET").getAttribute("aria-pressed") === "true", "the control reads pressed");
  ok(row(c.w, "KET").classList.contains("notdue"), "the row now reads not due");
  ok(row(c.w, "KET").querySelector(".streak").hidden === true,
     "the streak pill steps aside -- PTO already says why");
  click(c.w, pto(c.w, "KET"));
  ok(day(c, TODAY).ketoPto === undefined, "clicking it again clears it");
  ok(!row(c.w, "KET").classList.contains("notdue"), "and Keto is due again");
  // the row underneath still toggles the checkbox
  click(c.w, row(c.w, "KET"));
  ok(day(c, TODAY).keto === true, "tapping the row still records Keto");
}

console.log("\n-- independent: PTO on one marker leaves every other marker alone --");
{
  const c = open({});
  click(c.w, pto(c.w, "GYM"));
  ok(row(c.w, "GYM").classList.contains("notdue"), "Gym excused");
  ok(!row(c.w, "KET").classList.contains("notdue"), "Keto, due the same day, is unaffected");
  ok(!row(c.w, "VIT").classList.contains("notdue"), "neither is Vitamins");
  ok(day(c, TODAY).ketoPto === undefined && day(c, TODAY).vitaminsPto === undefined,
     "no PTO flag leaked onto either of them");
}

console.log("\n-- a PTO'd day counts nowhere for that marker, but a plain miss elsewhere still lapses --");
{
  // Keto walked five of six days, missed the middle one -- once with PTO
  // covering it, once without, isolating what PTO alone changes
  const runOf = excused => {
    const seed = {};
    for (let i = 0; i <= 5; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
    seed[back(3)] = { vitamins: true, _t: 1 };
    if (excused) seed[back(3)].ketoPto = true;
    const o = open({ "dailyReadout.v1": JSON.stringify(seed) });
    return { w: o.w, n: +row(o.w, "KET").querySelector(".streak").textContent.replace("d", "") };
  };
  const excused = runOf(true), plain = runOf(false);
  ok(excused.n > plain.n,
     "the streak steps over the PTO'd day but breaks on a plain miss: " + excused.n + "d vs " + plain.n + "d");
  ok(!/Keto/.test(excused.w.document.getElementById("guard").textContent),
     "no guardrail miss once PTO covers it: " + excused.w.document.getElementById("guard").textContent.slice(0, 100));

  // ten days of Vitamins logged, Gym missed every one, no PTO anywhere --
  // Gym's own lapse must still fire even though PTO exists as a mechanism
  const seed2 = {};
  for (let i = 0; i < 10; i++) seed2[back(i)] = { vitamins: true, gym: false, _t: 1 };
  const c2 = open({ "dailyReadout.v1": JSON.stringify(seed2) });
  ok(/Gym/.test(c2.w.document.getElementById("guard").textContent),
     "an un-excused lapse elsewhere is unaffected by PTO existing at all");
}

console.log("\n-- reads N/A in the month table, only for the excused marker on that day --");
{
  const seed = { [back(1)]: { ketoPto: true, keto: false, gym: true, vitamins: true, _t: 1 } };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  const sq = (code) => c.w.document.getElementById("grid")
    .querySelector('.sq[data-d="' + back(1) + '"][title^="' + code + '"]');
  ok(sq("KET").classList.contains("na"), "Keto's square is ghosted: " + sq("KET").className);
  ok(!sq("GYM").classList.contains("na"), "Gym's square, same day, is not: " + sq("GYM").className);
}

console.log("\n-- the export reads N/A for just the excused marker that day --");
{
  const seed = { [back(1)]: { ketoPto: true, gym: true, vitamins: true, _t: 1 } };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
  setTimeout(() => {
    const head = copied.split("\n")[0].split(",");
    const line = (copied.split("\n").find(l => l.indexOf(back(1)) === 0) || "").split(",");
    ok(line[head.indexOf("Keto")] === "N/A", "Keto reads N/A: " + line[head.indexOf("Keto")]);
    ok(line[head.indexOf("Gym")] === "Yes", "Gym, same day, reads Yes as normal: " + line[head.indexOf("Gym")]);

    console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
    process.exit(fail ? 1 : 0);
  }, 150);
}
