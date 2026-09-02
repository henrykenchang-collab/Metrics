/* A start date is what makes a due day worth counting toward a marker's
   streak or a Guardrails lapse -- everything else about the marker (the
   checkbox, the Markers Due Today count, the month grid) is unaffected by
   whether one is set. A marker already carrying real history gets one
   backfilled automatically, from the earliest day it has data for, so
   nothing already being tracked goes quiet the moment this shipped. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
const NOW = (() => { const d = new Date(); if (d.getDate() <= 10) { d.setDate(0); d.setDate(20); } return d; })();
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

console.log("\n-- a marker with no history and no start date --");
{
  const c = open({});
  const r = row(c.w, "KET");   // Keto: due every day, no hardcoded `since`
  ok(r.querySelector(".mstart").value === "", "the field starts blank");
  ok(!r.classList.contains("notdue"), "but the row itself still reads due");
  ok(r.querySelector(".streak").textContent === "0d", "the streak reads 0d -- nothing to count yet");
  const before = c.w.document.getElementById("scoreD").textContent;
  click(c.w, r);
  ok(day(c, TODAY).keto === true, "the checkbox still records");
  ok(c.w.document.getElementById("scoreD").textContent === before,
     "Markers Due Today is unaffected by the missing start date: " + before);
}

console.log("\n-- existing history is backfilled automatically --");
{
  const seed = {};
  for (let i = 0; i < 6; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  const r = row(c.w, "KET");
  ok(r.querySelector(".mstart").value === back(5),
     "backfilled to the earliest day Keto has data for: " + r.querySelector(".mstart").value);
  ok(r.querySelector(".streak").textContent === "6d",
     "and the streak counts right away, no manual start date needed: " + r.querySelector(".streak").textContent);
  ok(markStore(c).keto && markStore(c).keto.date === back(5), "and it is written to local storage");
}

console.log("\n-- setting a start date by hand --");
{
  const seed = {};
  for (let i = 0; i < 8; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  const st = row(c.w, "KET").querySelector(".mstart");
  ok(st.value === back(7), "backfilled first, same as above");
  st.value = back(3);
  st.dispatchEvent(new c.w.Event("change", { bubbles: true }));
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

  const st = row(c.w, "KET").querySelector(".mstart");
  st.value = back(9);
  st.dispatchEvent(new c.w.Event("change", { bubbles: true }));
  ok(/Keto/.test(c.w.document.getElementById("guard").textContent),
     "start date set, the same lapse now flags: " + c.w.document.getElementById("guard").textContent.slice(0, 160));
}

console.log("\n-- clearing a start date takes it back to not counting --");
{
  const seed = {};
  for (let i = 0; i < 5; i++) seed[back(i)] = { keto: true, vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  ok(row(c.w, "KET").querySelector(".streak").textContent === "5d", "counting to start with");
  const st = row(c.w, "KET").querySelector(".mstart");
  st.value = ""; st.dispatchEvent(new c.w.Event("change", { bubbles: true }));
  ok(row(c.w, "KET").querySelector(".streak").textContent === "0d", "cleared, back to nothing counted");
  ok(!("keto" in markStore(c)), "and dropped from storage rather than kept as an empty entry");
}

console.log("\n-- a marker with a hardcoded start date already has one --");
{
  const c = open({});
  const st = row(c.w, "SAU").querySelector(".mstart");
  ok(st.value === "2026-08-17", "Sauna's schema `since` shows up in the field: " + st.value);
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
