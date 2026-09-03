/* A start date is what makes a due day worth counting toward a marker's
   streak or a Guardrails lapse -- everything else about the marker (the
   checkbox, the Markers Due Today count, the month grid) is unaffected by
   whether one is set. A marker already carrying real history gets one
   backfilled automatically, from the earliest day it has data for, so
   nothing already being tracked goes quiet the moment this shipped.
   The field itself sits next to the streak as a compact trigger (a short
   M/D/YY date); the native picker underneath only appears once tapped. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
const NOW = (() => { const d = new Date(); if (d.getDate() <= 10) { d.setDate(0); d.setDate(20); } return d; })();
const TODAY = iso(NOW);
const back = n => shift(TODAY, -n);
const short = k => { const p = k.split("-"); return (+p[1]) + "/" + (+p[2]) + "/" + p[0].slice(2); };

function open(jar) {
  jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      const R = w.Date, f = TODAY + "T12:00:00";
      function F(...a) { return a.length ? new R(...a) : new R(f); }
      F.prototype = R.prototype; F.now = () => new R(f).getTime(); F.parse = R.parse; F.UTC = R.UTC; w.Date = F;
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const row = (w, code) => [...w.document.querySelectorAll("#rows > .row, #petrows > .row")]
  .find(b => b.querySelector(".row-code").textContent === code);
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const day = (c, k) => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[k] || {};
const markStore = c => JSON.parse(c.jar["dailyReadout.markerStart"] || "{}");
const trig = (w, code) => row(w, code).querySelector(".mstart-trigger");
const inp = (w, code) => row(w, code).querySelector(".mstart-input");
// tap the trigger, set the revealed native date field, commit
const setStart = (c, code, v) => {
  click(c.w, trig(c.w, code));
  const i = inp(c.w, code);
  i.value = v;
  i.dispatchEvent(new c.w.Event("change", { bubbles: true }));
};

console.log("\n-- a marker with no history and no start date --");
{
  const c = open({});
  const r = row(c.w, "KET");   // Keto: due every day, no hardcoded `since`
  ok(trig(c.w, "KET").textContent === "Set Start", "the trigger reads a plain placeholder");
  ok(inp(c.w, "KET").value === "", "and the field underneath starts blank");
  ok(inp(c.w, "KET").hidden === true, "hidden until tapped");
  ok(!r.classList.contains("notdue"), "but the row itself still reads due");
  ok(r.querySelector(".streak").textContent === "0d", "the streak reads 0d -- nothing to count yet");
  const before = c.w.document.getElementById("scoreD").textContent;
  click(c.w, r);
  ok(day(c, TODAY).keto === true, "the checkbox still records");
  ok(c.w.document.getElementById("scoreD").textContent === before,
     "Markers Due Today is unaffected by the missing start date: " + before);
}

console.log("\n-- it sits right next to the streak --");
{
  const c = open({});
  const kids = [...row(c.w, "KET").children].map(el => el.className);
  const iStart = kids.findIndex(cl => /\bmstart-wrap\b/.test(cl));
  const iStreak = kids.findIndex(cl => /\bstreak\b/.test(cl));
  const iCell = kids.findIndex(cl => /\bcell\b/.test(cl));
  ok(iStart === iStreak - 1 && iStreak === iCell - 1,
     "start date, then streak, then the checkbox: " + kids.join(" | "));
}

console.log("\n-- tapping the trigger reveals the picker, without toggling the row --");
{
  const c = open({});
  click(c.w, trig(c.w, "KET"));
  ok(inp(c.w, "KET").hidden === false, "the native field appears");
  ok(day(c, TODAY).keto === undefined, "the row itself was not marked done");
}

console.log("\n-- existing history is backfilled automatically --");
{
  const seed = {};
  for (let i = 0; i < 6; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  ok(inp(c.w, "KET").value === back(5),
     "backfilled to the earliest day Keto has data for: " + inp(c.w, "KET").value);
  ok(trig(c.w, "KET").textContent === short(back(5)), "shown short on the trigger: " + trig(c.w, "KET").textContent);
  ok(row(c.w, "KET").querySelector(".streak").textContent === "6d",
     "and the streak counts right away, no manual start date needed: " + row(c.w, "KET").querySelector(".streak").textContent);
  ok(markStore(c).keto && markStore(c).keto.date === back(5), "and it is written to local storage");
}

console.log("\n-- setting a start date by hand --");
{
  const seed = {};
  for (let i = 0; i < 8; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  ok(inp(c.w, "KET").value === back(7), "backfilled first, same as above");
  setStart(c, "KET", back(3));
  ok(inp(c.w, "KET").hidden === true, "the field hides again once committed");
  ok(trig(c.w, "KET").textContent === short(back(3)), "the trigger updates: " + trig(c.w, "KET").textContent);
  ok(row(c.w, "KET").querySelector(".streak").textContent === "4d",
     "only the days on or after the new date count now: " + row(c.w, "KET").querySelector(".streak").textContent);
  ok(markStore(c).keto.date === back(3), "the override persists, replacing the backfilled value");
  ok(!row(c.w, "KET").classList.contains("notdue"), "still reads due either way -- only the streak moved");
}

console.log("\n-- Guardrails only flags a lapse once a start date is in place --");
{
  // a session that starts with nothing logged anywhere, so the boot-time
  // backfill genuinely has no history to work from -- ten days of vitamins,
  // logged one at a time by paging back through the app itself, keto missed
  // every one of them
  const c = open({});
  for (let i = 0; i < 10; i++) {
    if (i) click(c.w, c.w.document.getElementById("prev"));
    click(c.w, row(c.w, "VIT"));
  }
  click(c.w, c.w.document.getElementById("todayBtn"));
  const guardText = c.w.document.getElementById("guard").textContent;
  ok(!/Keto/.test(guardText), "no start date yet -- the lapse stays quiet: " + guardText.slice(0, 120));

  setStart(c, "KET", back(9));
  ok(/Keto/.test(c.w.document.getElementById("guard").textContent),
     "start date set, the same lapse now flags: " + c.w.document.getElementById("guard").textContent.slice(0, 160));
}

console.log("\n-- clearing a start date takes it back to not counting --");
{
  const seed = {};
  for (let i = 0; i < 5; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  ok(row(c.w, "KET").querySelector(".streak").textContent === "5d", "counting to start with");
  setStart(c, "KET", "");
  ok(trig(c.w, "KET").textContent === "Set Start", "the trigger goes back to a placeholder");
  ok(row(c.w, "KET").querySelector(".streak").textContent === "0d", "cleared, back to nothing counted");
  ok(!("keto" in markStore(c)), "and dropped from storage rather than kept as an empty entry");
}

console.log("\n-- a marker with a hardcoded start date already has one --");
{
  const c = open({});
  ok(inp(c.w, "SAU").value === "2026-08-17", "Sauna's schema `since` shows up in the field: " + inp(c.w, "SAU").value);
  ok(trig(c.w, "SAU").textContent === "8/17/26", "and short on the trigger: " + trig(c.w, "SAU").textContent);
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
