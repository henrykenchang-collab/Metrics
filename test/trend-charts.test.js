/* The Trend Charts view: a link after "Markers Due Today" swaps the whole
   daily view for four small-multiple line charts (Sleep, HRV, Avg HR,
   CPAP), and a link back restores it. Guards the view swap itself, that
   each chart only plots real numeric values (never markers/tags/etc that
   happen to share a day), the empty state, and that switching views never
   touches the log. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
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
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

console.log("\n-- the link and the two views --");
let c = open({});
ok(!!c.w.document.getElementById("chartsLink"), "a Trend Charts link exists");
ok(c.w.document.getElementById("chartsLink").textContent.indexOf("Trend Charts") >= 0, "labelled Trend Charts");
const readoutRow = c.w.document.querySelector(".readout-label-row");
ok(readoutRow && readoutRow.textContent.indexOf("Markers Due Today") >= 0 && readoutRow.textContent.indexOf("Trend Charts") >= 0,
   "sits in the same row as Markers Due Today");
ok(c.w.document.getElementById("dailyView").hidden === false, "daily view starts open");
ok(c.w.document.getElementById("chartsView").hidden === true, "charts view starts hidden");

click(c.w, c.w.document.getElementById("chartsLink"));
ok(c.w.document.getElementById("dailyView").hidden === true, "opening Trend Charts hides the daily view");
ok(c.w.document.getElementById("chartsView").hidden === false, "and shows the charts view");
ok(!!c.w.document.getElementById("backToDaily"), "a way back exists");
ok(c.w.document.getElementById("backToDaily").textContent.indexOf("Daily Readout") >= 0, "labelled back to Daily Readout");

click(c.w, c.w.document.getElementById("backToDaily"));
ok(c.w.document.getElementById("dailyView").hidden === false, "going back restores the daily view");
ok(c.w.document.getElementById("chartsView").hidden === true, "and hides the charts view again");

console.log("\n-- four charts, the right metrics, only real numbers plotted --");
// three full weeks (Mon-Sun), a clean-round number of days apart from today
// so every seeded day is safely in the past regardless of when this runs
const thisMon = (() => { const d = new Date(); const b = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - b); return iso(d); })();
const weekAgo = n => shift(thisMon, -7 * n - 21);   // three weeks, well before "this week"
const seed = {};
[0, 1, 2].forEach(w => {
  const mon = weekAgo(w);
  for (let i = 0; i < 7; i++) {
    seed[shift(mon, i)] = {
      sleep: 60 + w, hrv: 30 + w, avgHr: 70 - w, cpap: 80,
      vitamins: true, tags: ["Stress"], changed: "note", meals: [{ m: "Breakfast", t: "eggs" }], _t: 1
    };
  }
});
c = open({ "dailyReadout.v1": JSON.stringify(seed) });
click(c.w, c.w.document.getElementById("chartsLink"));
const charts = [...c.w.document.querySelectorAll(".trend-chart")];
ok(charts.length === 4, "four charts: " + charts.length);
const names = charts.map(el => el.querySelector(".tc-name").textContent);
ok(names.join(" | ") === "Sleep Score | Heart Rate Variability | Average Resting Heart Rate | CPAP Score",
   "the four metrics, in order: " + names.join(" | "));
charts.forEach((el, i) => {
  ok(el.querySelectorAll(".tc-dot").length === 3, names[i] + ": one point per week, not per night: " + el.querySelectorAll(".tc-dot").length);
  ok(el.querySelector(".tc-line").getAttribute("d").startsWith("M"), names[i] + ": a real path, not empty");
  ok(el.querySelector(".tc-agg").textContent === "Weekly average", names[i] + ": labelled as a weekly average");
  ok(el.querySelectorAll(".tc-label").length === 3, names[i] + ": one value label per point");
  ok(!!el.querySelector(".tc-trend"), names[i] + ": a fitted trend line is drawn");
});

console.log("\n-- the value label reads the rounded weekly average, and the trend line fits it --");
// sleep is 60+w for week w=0 (most recent of the three) through w=2 (oldest),
// so left-to-right (oldest first) the chart reads 62, 61, 60
const sleepTrendChart = charts[0];
const labelText = [...sleepTrendChart.querySelectorAll(".tc-label")].map(t => t.textContent);
ok(labelText.join(",") === "62,61,60", "labels read the exact weekly averages, oldest week first: " + labelText.join(","));
const trend = sleepTrendChart.querySelector(".tc-trend");
const y1 = +trend.getAttribute("y1"), y2 = +trend.getAttribute("y2");
const dotYs = [...sleepTrendChart.querySelectorAll(".tc-dot")].map(c => +c.getAttribute("cy"));
ok(Math.abs(y1 - dotYs[0]) < 0.5 && Math.abs(y2 - dotYs[2]) < 0.5,
   "a perfectly straight run of weeks puts the trend line right through the first and last dot");

console.log("\n-- days within one week collapse to a single averaged point --");
const monA = weekAgo(0);
c = open({ "dailyReadout.v1": JSON.stringify({
  [monA]: { sleep: 60, vitamins: true, _t: 1 },
  [shift(monA, 2)]: { sleep: 70, vitamins: true, _t: 1 },
  [shift(monA, 4)]: { sleep: 80, vitamins: true, _t: 1 },   // still the same Mon-Sun week
}) });
click(c.w, c.w.document.getElementById("chartsLink"));
const oneWeekChart = [...c.w.document.querySelectorAll(".trend-chart")][0];
ok(!!oneWeekChart.querySelector(".empty") && oneWeekChart.querySelectorAll(".tc-dot").length === 0,
   "three nights in the same week are one data point, which alone is still \"not enough\"");

console.log("\n-- a second week turns that single point into a line --");
c = open({ "dailyReadout.v1": JSON.stringify({
  [monA]: { sleep: 60, vitamins: true, _t: 1 },
  [shift(monA, 2)]: { sleep: 80, vitamins: true, _t: 1 },        // averages to 70 for week one
  [shift(monA, 7)]: { sleep: 90, vitamins: true, _t: 1 },        // the following Monday: week two
}) });
click(c.w, c.w.document.getElementById("chartsLink"));
const twoWeekChart = [...c.w.document.querySelectorAll(".trend-chart")][0];
ok(twoWeekChart.querySelectorAll(".tc-dot").length === 2, "two weeks, two points: " + twoWeekChart.querySelectorAll(".tc-dot").length);
ok(!twoWeekChart.querySelector(".empty"), "and a real line now, not the empty state");

console.log("\n-- a metric with no data yet reads as empty, not broken --");
c = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { vitamins: true, _t: 1 } }) });
click(c.w, c.w.document.getElementById("chartsLink"));
const empties = [...c.w.document.querySelectorAll(".trend-chart")];
ok(empties.every(el => el.querySelector(".empty")), "every chart shows the empty state with no biometric data logged");
ok(!c.w.document.getElementById("trendCharts").innerHTML.match(/NaN/), "no NaN anywhere");

console.log("\n-- a single logged night is still \"not enough\", not a one-point chart --");
c = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { sleep: 70, _t: 1 } }) });
click(c.w, c.w.document.getElementById("chartsLink"));
const sleepChart = [...c.w.document.querySelectorAll(".trend-chart")][0];
ok(!!sleepChart.querySelector(".empty") && !sleepChart.querySelector(".tc-line"),
   "one point alone shows the empty state rather than a dot with no line");

console.log("\n-- switching views never touches the log --");
c = open({ "dailyReadout.v1": JSON.stringify(seed) });
const before = c.jar["dailyReadout.v1"];
click(c.w, c.w.document.getElementById("chartsLink"));
click(c.w, c.w.document.getElementById("backToDaily"));
ok(c.jar["dailyReadout.v1"] === before, "the stored log is byte-identical after a round trip through the charts view");

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
