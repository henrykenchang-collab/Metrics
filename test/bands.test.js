/* Sleep, Rest HR, and HRV color their own number green/yellow/red against a
   stated target range. Nothing else in Sleep & Recovery (CPAP, Avg HR,
   Deep/REM/Light) has one -- guards the boundaries, the exclusivity, and
   that typing/blur/day-switch all repaint it the same way. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const TODAY = iso(new Date());

function open(jar) { jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const cell = (w, label) => [...w.document.querySelectorAll("#stats .stat")]
  .find(e => e.querySelector(".stat-label").textContent === label);
const band = el => ["band-good", "band-warn", "band-bad"].find(c => el.classList.contains(c)) || null;
const type = (w, input, v) => { input.value = String(v); input.dispatchEvent(new w.Event("input", { bubbles: true })); };

console.log("\n-- Sleep: >=70 good, 65-69 warn, <65 bad --");
let c = open({});
const sleepIn = cell(c.w, "Sleep").querySelector("input");
type(c.w, sleepIn, 70); ok(band(sleepIn) === "band-good", "70 is good");
type(c.w, sleepIn, 69); ok(band(sleepIn) === "band-warn", "69 is warn");
type(c.w, sleepIn, 65); ok(band(sleepIn) === "band-warn", "65 is warn");
type(c.w, sleepIn, 64); ok(band(sleepIn) === "band-bad", "64 is bad");
type(c.w, sleepIn, 0);  ok(band(sleepIn) === "band-bad", "0 is bad");
type(c.w, sleepIn, 100);ok(band(sleepIn) === "band-good", "100 is good");

console.log("\n-- Rest HR: <=60 good, 61-64 warn, >=65 bad --");
c = open({});
const hrIn = cell(c.w, "Rest HR").querySelector("input");
type(c.w, hrIn, 60); ok(band(hrIn) === "band-good", "60 is good");
type(c.w, hrIn, 61); ok(band(hrIn) === "band-warn", "61 is warn");
type(c.w, hrIn, 64); ok(band(hrIn) === "band-warn", "64 is warn");
type(c.w, hrIn, 65); ok(band(hrIn) === "band-bad", "65 is bad (the boundary the instruction left open)");

console.log("\n-- HRV: >=40 good, 35-39 warn, <35 bad --");
c = open({});
const hrvIn = cell(c.w, "HRV").querySelector("input");
type(c.w, hrvIn, 40); ok(band(hrvIn) === "band-good", "40 is good");
type(c.w, hrvIn, 39); ok(band(hrvIn) === "band-warn", "39 is warn");
type(c.w, hrvIn, 35); ok(band(hrvIn) === "band-warn", "35 is warn");
type(c.w, hrvIn, 34); ok(band(hrvIn) === "band-bad", "34 is bad");

console.log("\n-- only these three carry a band --");
c = open({});
ok(band(cell(c.w, "CPAP").querySelector("input")) === null, "CPAP has no band before typing");
type(c.w, cell(c.w, "CPAP").querySelector("input"), 90);
ok(band(cell(c.w, "CPAP").querySelector("input")) === null, "nor after -- it has no stated range");
const avgHrIn = [...c.w.document.querySelectorAll("#stats2 .stat")]
  .find(e => e.querySelector(".stat-label").textContent === "Avg HR").querySelector("input");
type(c.w, avgHrIn, 50);
ok(band(avgHrIn) === null, "Avg HR is untouched even though it shares Rest HR's unit and range");

console.log("\n-- clearing the field clears the color --");
c = open({});
type(c.w, sleepIn, 80); ok(band(sleepIn) === "band-good", "colored once typed");
type(c.w, sleepIn, "");
ok(band(sleepIn) === null, "and blank again once cleared");

console.log("\n-- it survives a blur-clamp and a day switch --");
c = open({});
type(c.w, hrIn, 200);
hrIn.dispatchEvent(new c.w.Event("blur", { bubbles: true }));
ok(hrIn.value === "125" && band(hrIn) === "band-bad", "clamped to 125, still banded bad");
c = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { sleep: 72, hr: 58, hrv: 30, _t: 1 } }) });
ok(band(cell(c.w, "Sleep").querySelector("input")) === "band-good", "sleep 72 reads good on open, no typing needed");
ok(band(cell(c.w, "Rest HR").querySelector("input")) === "band-good", "hr 58 reads good on open");
ok(band(cell(c.w, "HRV").querySelector("input")) === "band-bad", "hrv 30 reads bad on open");

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
