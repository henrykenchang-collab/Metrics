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

console.log("\n-- a month/year tick marks the bottom axis wherever the weeks cross into a new month --");
// three Mondays, each in a different, distinct calendar month, safely in the
// past regardless of when this test runs
const monthWeek = mon => { const seed = {}; for (let i = 0; i < 7; i++) seed[shift(mon, i)] = { sleep: 70, _t: 1 }; return seed; };
const dateOf = k => { const p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const monthYearOf = k => dateOf(k).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const monthOnlyOf = k => dateOf(k).toLocaleDateString(undefined, { month: "short" });
// same calendar year throughout: only the first tick needs the year, the
// rest would just repeat it and crowd the axis for nothing
const monthMons = ["2020-01-06", "2020-02-03", "2020-03-02"];
const monthSeed = Object.assign({}, ...monthMons.map(monthWeek));
c = open({ "dailyReadout.v1": JSON.stringify(monthSeed) });
click(c.w, c.w.document.getElementById("chartsLink"));
const monthChart = [...c.w.document.querySelectorAll(".trend-chart")][0];
const tickTexts = [...monthChart.querySelectorAll(".tc-tick")].map(t => t.textContent);
const expectedTicks = [monthYearOf(monthMons[0]), monthOnlyOf(monthMons[1]), monthOnlyOf(monthMons[2])];
ok(tickTexts.join(",") === expectedTicks.join(","),
   "one tick per month, oldest first, year only where it's needed: " + tickTexts.join(","));
ok(monthChart.querySelectorAll(".tc-tickline").length === tickTexts.length, "a tick mark to match each label");

console.log("\n-- and the year rides along again the moment it actually changes --");
const yearMons = ["2019-11-04", "2019-12-02", "2020-01-06"];
const yearSeed = Object.assign({}, ...yearMons.map(monthWeek));
c = open({ "dailyReadout.v1": JSON.stringify(yearSeed) });
click(c.w, c.w.document.getElementById("chartsLink"));
const yearChart = [...c.w.document.querySelectorAll(".trend-chart")][0];
const yearTicks = [...yearChart.querySelectorAll(".tc-tick")].map(t => t.textContent);
const expectedYearTicks = [monthYearOf(yearMons[0]), monthOnlyOf(yearMons[1]), monthYearOf(yearMons[2])];
ok(yearTicks.join(",") === expectedYearTicks.join(","),
   "Nov '19, Dec (same year, no repeat), Jan '20 (the rollover gets it back): " + yearTicks.join(","));

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

console.log("\n-- a period picker on every chart --");
// two years of the first of each month, so every period has enough points
const many = {};
for (let y = 2024; y <= 2025; y++) for (let m = 1; m <= 12; m++) {
  const k = y + "-" + String(m).padStart(2, "0") + "-0";
  for (let d = 1; d <= 3; d++) many[k + d] = { sleep: 60 + m, hrv: 30 + m, avgHr: 70, cpap: 80, _t: 1 };
}
c = open({ "dailyReadout.v1": JSON.stringify(many) });
click(c.w, c.w.document.getElementById("chartsLink"));
const withPicker = [...c.w.document.querySelectorAll(".trend-chart")];
ok(withPicker.every(el => el.querySelector(".tc-period")), "all four carry one");
const opts = [...withPicker[0].querySelectorAll(".tc-period option")].map(o => o.value + ":" + o.textContent);
ok(opts.join(" | ") === "week:Weekly | month:Monthly | quarter:Quarterly | year:Yearly",
   "the four periods, in order: " + opts.join(" | "));
ok(withPicker[0].querySelector(".tc-period").value === "week", "weekly is the default");

console.log("\n-- switching period re-buckets that chart, and only that one --");
const sleepEl = () => [...c.w.document.querySelectorAll(".trend-chart")][0];
const hrvEl = () => [...c.w.document.querySelectorAll(".trend-chart")][1];
const dotsIn = el => el.querySelectorAll(".tc-dot").length;
const weekDots = dotsIn(sleepEl()), hrvWeekDots = dotsIn(hrvEl());
const pick = (el, v) => { const s = el.querySelector(".tc-period"); s.value = v;
  s.dispatchEvent(new c.w.Event("change", { bubbles: true })); };

pick(sleepEl(), "month");
ok(dotsIn(sleepEl()) === 24, "monthly gives 24 points over two years: " + dotsIn(sleepEl()));
ok(sleepEl().querySelector(".tc-agg").textContent === "Monthly average", "and says so");
ok(dotsIn(hrvEl()) === hrvWeekDots, "the HRV chart beside it is left on weekly");

pick(sleepEl(), "quarter");
ok(dotsIn(sleepEl()) === 8, "quarterly gives 8: " + dotsIn(sleepEl()));
ok(sleepEl().querySelector(".tc-agg").textContent === "Quarterly average", "labelled quarterly");

pick(sleepEl(), "year");
ok(dotsIn(sleepEl()) === 2, "yearly gives 2: " + dotsIn(sleepEl()));
ok(sleepEl().querySelector(".tc-agg").textContent === "Yearly average", "labelled yearly");

pick(sleepEl(), "week");
ok(dotsIn(sleepEl()) === weekDots, "and back to weekly returns the original series");

console.log("\n-- the range at the top speaks in the period's own units --");
// bucket keys are period START dates, so a plain date range would both read
// as a day and understate the real span ("Nov 1 - Aug 1" for whole months)
pick(sleepEl(), "month");
ok(/^\w+ \d\d – \w+ \d\d$/.test(sleepEl().querySelector(".tc-range").textContent),
   "monthly reads as months: " + sleepEl().querySelector(".tc-range").textContent);
pick(sleepEl(), "quarter");
ok(/^Q[1-4] \d\d – Q[1-4] \d\d$/.test(sleepEl().querySelector(".tc-range").textContent),
   "quarterly reads as quarters: " + sleepEl().querySelector(".tc-range").textContent);
pick(sleepEl(), "year");
ok(sleepEl().querySelector(".tc-range").textContent === "2024 – 2025",
   "yearly reads as years: " + sleepEl().querySelector(".tc-range").textContent);
pick(sleepEl(), "week");
ok(/^\w+ \d+ – \w+ \d+$/.test(sleepEl().querySelector(".tc-range").textContent),
   "weekly still reads as dates: " + sleepEl().querySelector(".tc-range").textContent);

console.log("\n-- the choice is remembered, per chart, and never in the log --");
pick(sleepEl(), "quarter");
pick(hrvEl(), "year");
const stored = JSON.parse(c.jar["dailyReadout.trendPeriod"]);
ok(stored.sleep === "quarter" && stored.hrv === "year", "stored per metric: " + JSON.stringify(stored));
ok(!/trendPeriod|quarter/.test(c.jar["dailyReadout.v1"] || ""), "the log is untouched by a view setting");
const reopened = open(c.jar);
click(reopened.w, reopened.w.document.getElementById("chartsLink"));
const back2 = [...reopened.w.document.querySelectorAll(".trend-chart")];
ok(back2[0].querySelector(".tc-period").value === "quarter" &&
   back2[1].querySelector(".tc-period").value === "year", "and each comes back where it was left");
ok(back2[2].querySelector(".tc-period").value === "week", "one never touched is still weekly");

console.log("\n-- a period with too little history still lets you back out --");
c = open({ "dailyReadout.v1": JSON.stringify({
  [shift(thisMon, -21)]: { sleep: 70, _t: 1 }, [shift(thisMon, -14)]: { sleep: 72, _t: 1 } }) });
click(c.w, c.w.document.getElementById("chartsLink"));
pick(sleepEl(), "year");
ok(!!sleepEl().querySelector(".empty"), "one year of data is not a yearly trend");
ok(/Not enough logged years/.test(sleepEl().querySelector(".empty").textContent),
   "and it names the period: " + sleepEl().querySelector(".empty").textContent);
ok(!!sleepEl().querySelector(".tc-period"), "the picker is still there to escape with");
pick(sleepEl(), "week");
ok(!sleepEl().querySelector(".empty") && dotsIn(sleepEl()) === 2, "switching back plots again");

console.log("\n-- switching views never touches the log --");
c = open({ "dailyReadout.v1": JSON.stringify(seed) });
const before = c.jar["dailyReadout.v1"];
click(c.w, c.w.document.getElementById("chartsLink"));
click(c.w, c.w.document.getElementById("backToDaily"));
ok(c.jar["dailyReadout.v1"] === before, "the stored log is byte-identical after a round trip through the charts view");

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
