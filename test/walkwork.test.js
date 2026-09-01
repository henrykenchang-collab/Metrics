/* Walk 15min (Work): due Monday to Friday, and not on a federal holiday.
   Everything that asks whether a marker is due comes through isDue, so this
   checks the holiday actually falls out of all of them -- the row, the
   readout's denominator, the streak, the month grid and the export -- rather
   than only out of the one the eye happens to land on. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const TODAY = iso(new Date());
let copied = "";

// pins the clock, so a specific weekday or holiday can be opened
function openOn(day, jar) {
  // one object: the store the page writes to has to be the one we read back
  jar = jar || {};
  const sess = { "dailyReadout.cur": JSON.stringify({ d: day, on: day }) };
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      const R = w.Date, f = day + "T12:00:00";
      function F(...a) { return a.length ? new R(...a) : new R(f); }
      F.prototype = R.prototype; F.now = () => new R(f).getTime(); F.parse = R.parse; F.UTC = R.UTC; w.Date = F;
      Object.defineProperty(w.navigator, "clipboard", { value: { writeText: t => { copied = t; return Promise.resolve(); } }, configurable: true });
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", sess]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const row = w => [...w.document.querySelectorAll("#rows > .row, #petrows > .row")]
  .find(b => b.querySelector(".row-code").textContent === "WWK");
const title = w => row(w).querySelector(".row-name").textContent.trim();
const notDue = w => row(w).classList.contains("notdue");

console.log("\n-- the row --");
let c = openOn("2026-09-02");                      // a Wednesday
ok(!!row(c.w), "a WWK row exists");
ok(title(c.w) === "Walk (Work): 15 Min · Workdays",
   "one word for Mon-Fri-minus-holidays: " + JSON.stringify(title(c.w)));
ok(!notDue(c.w), "due on a Wednesday");
row(c.w).dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
ok(JSON.parse(c.jar["dailyReadout.v1"])["2026-09-02"].walkWork === true, "and it records");

console.log("\n-- the week --");
// Mon 31 Aug through Sun 6 Sep 2026, none of them a holiday
const week = { "2026-08-31": "Mon", "2026-09-01": "Tue", "2026-09-02": "Wed",
               "2026-09-03": "Thu", "2026-09-04": "Fri" };
Object.keys(week).forEach(k => ok(!notDue(openOn(k).w), "due on " + week[k] + " " + k));
ok(notDue(openOn("2026-09-05").w), "not due Saturday");
ok(notDue(openOn("2026-09-06").w), "not due Sunday");

console.log("\n-- and not on a federal holiday, even a Monday --");
// Labor Day 2026 is Monday 7 September
const labor = openOn("2026-09-07");
ok(/Labor Day/.test(labor.w.document.getElementById("dow").textContent),
   "the day is the holiday: " + labor.w.document.getElementById("dow").textContent);
ok(notDue(labor.w), "so the walk is not due on it");
// Thanksgiving, a Thursday
ok(notDue(openOn("2026-11-26").w), "nor on Thanksgiving");
// 4 July 2026 is a Saturday, observed on Friday the 3rd -- the observed day is the one that counts
ok(notDue(openOn("2026-07-03").w), "nor on an observed holiday that lands on a Friday");

console.log("\n-- a holiday is not a miss anywhere --");
// the readout's denominator on the holiday must not count it
const den = labor.w.document.getElementById("scoreD").textContent;
ok(/\/\d/.test(den), "the readout still counts a denominator: " + den);
// against another Monday, so the holiday is the only thing that differs
const plainMon = openOn("2026-08-31").w.document.getElementById("scoreD").textContent;
const n = t => +t.replace("/", "");
ok(n(plainMon) === n(den) + 1,
   "a plain Monday asks for one more than Labor Day does: " + plainMon + " vs " + den);
// nothing before `since` reads as a lapse either
const old = openOn("2026-09-08", { "dailyReadout.v1": JSON.stringify({
  "2026-06-01": { vitamins: true, _t: 1 } }) });         // a Monday, months before it existed
ok(!/Walk 15min \(Work\)/.test(old.w.document.getElementById("guard").textContent),
   "no retroactive lapse from before it started: " + old.w.document.getElementById("guard").textContent.slice(0, 120));
ok(!/NaN/.test(labor.w.document.getElementById("grid").innerHTML), "grid clean");

console.log("\n-- the month grid and the export --");
const labels = [...labor.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e => e.textContent);
ok(labels.includes("WWK"), "it has a month-grid row: " + labels.join(","));
const e = openOn("2026-09-07", { "dailyReadout.v1": JSON.stringify({
  "2026-09-02": { walkWork: true, vitamins: true, _t: 1 },   // a Wednesday, done
  "2026-09-03": { vitamins: true, _t: 1 },                   // a Thursday, missed
  "2026-09-07": { vitamins: true, _t: 1 } }) });             // Labor Day, not due
e.w.document.getElementById("copyBtn").dispatchEvent(new e.w.MouseEvent("click", { bubbles: true }));
setTimeout(() => {
  const head = copied.split("\n")[0];
  ok(/Walk 15min \(Work\)/.test(head), "the export names it in full: " + /Walk 15min \(Work\)/.exec(head));
  const col = head.split(",").indexOf("Walk 15min (Work)");
  const cell = k => (copied.split("\n").find(l => l.indexOf(k) === 0) || "").split(",")[col];
  ok(cell("2026-09-02") === "Yes", "the Wednesday it was done reads Yes: " + cell("2026-09-02"));
  ok(cell("2026-09-03") === "No", "the Thursday it was not reads No: " + cell("2026-09-03"));
  ok(cell("2026-09-07") === "N/A", "and Labor Day reads N/A, not a miss: " + cell("2026-09-07"));
  console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
  process.exit(fail ? 1 : 0);
}, 150);
