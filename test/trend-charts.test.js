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
const seed = {};
for (let i = 0; i < 10; i++) {
  seed[shift(TODAY, -i)] = {
    sleep: 60 + i, hrv: 30 + i, avgHr: 70 - i, cpap: 80,
    vitamins: true, tags: ["Stress"], changed: "note", meals: [{ m: "Breakfast", t: "eggs" }], _t: 1
  };
}
c = open({ "dailyReadout.v1": JSON.stringify(seed) });
click(c.w, c.w.document.getElementById("chartsLink"));
const charts = [...c.w.document.querySelectorAll(".trend-chart")];
ok(charts.length === 4, "four charts: " + charts.length);
const names = charts.map(el => el.querySelector(".tc-name").textContent);
ok(names.join(" | ") === "Sleep Score | Heart Rate Variability | Average Resting Heart Rate | CPAP Score",
   "the four metrics, in order: " + names.join(" | "));
charts.forEach((el, i) => {
  ok(el.querySelectorAll(".tc-dot").length === 10, names[i] + ": ten points, one per seeded night");
  ok(el.querySelector(".tc-line").getAttribute("d").startsWith("M"), names[i] + ": a real path, not empty");
});

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
