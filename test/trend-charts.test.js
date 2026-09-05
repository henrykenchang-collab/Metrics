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
// 20 straight days ending yesterday: inside the default 30-day window, and
// carrying markers/tags/meals alongside the numbers to prove they are ignored
const seed = {};
for (let i = 1; i <= 20; i++) {
  seed[shift(TODAY, -i)] = {
    sleep: 60 + i, hrv: 30 + i, avgHr: 70 - i % 5, cpap: 80,
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
  ok(el.querySelectorAll(".tc-dot").length === 20, names[i] + ": a point per logged day in the window, and nothing for the markers or tags sharing it: " + el.querySelectorAll(".tc-dot").length);
  ok(el.querySelector(".tc-line").getAttribute("d").startsWith("M"), names[i] + ": a real path, not empty");
  ok(el.querySelector(".tc-agg").textContent === "Last 30 days", names[i] + ": labelled with its window");
  ok(el.querySelectorAll(".tc-label").length === 20, names[i] + ": one value label per point");
  ok(!!el.querySelector(".tc-trend"), names[i] + ": a fitted trend line is drawn");
});

console.log("\n-- the value label reads the day's own number, and the trend line fits it --");
// sleep is 60+i for i days back, so left-to-right (oldest first) it climbs
// 80, 79 ... 61 -- a perfectly straight run
const sleepTrendChart = charts[0];
const labelText = [...sleepTrendChart.querySelectorAll(".tc-label")].map(t => t.textContent);
ok(labelText[0] === "80" && labelText[labelText.length - 1] === "61",
   "labels read the exact values, oldest day first: " + labelText.join(","));
const trend = sleepTrendChart.querySelector(".tc-trend");
const y1 = +trend.getAttribute("y1"), y2 = +trend.getAttribute("y2");
const dotYs = [...sleepTrendChart.querySelectorAll(".tc-dot")].map(c => +c.getAttribute("cy"));
ok(Math.abs(y1 - dotYs[0]) < 0.5 && Math.abs(y2 - dotYs[dotYs.length - 1]) < 0.5,
   "a perfectly straight run puts the trend line right through the first and last dot");

console.log("\n-- the longer windows bucket, and a bucket is an average --");
// three whole weeks, all inside the 13-week window
const thisMon = (() => { const d = new Date(); const b = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - b); return iso(d); })();
const weekAgo = n => shift(thisMon, -7 * n - 21);
const weekly = {};
[0, 1, 2].forEach(w => { for (let i = 0; i < 7; i++) weekly[shift(weekAgo(w), i)] = { sleep: 60 + w, _t: 1 }; });
c = open({ "dailyReadout.v1": JSON.stringify(weekly) });
click(c.w, c.w.document.getElementById("chartsLink"));
const qChart = () => [...c.w.document.querySelectorAll(".trend-chart")][0];
const setQ = v => { const sel = qChart().querySelector(".tc-period"); sel.value = v;
  sel.dispatchEvent(new c.w.Event("change", { bubbles: true })); };
setQ("quarter");
ok(qChart().querySelectorAll(".tc-dot").length === 3, "three weeks are three points, not 21: " + qChart().querySelectorAll(".tc-dot").length);
const qLabels = [...qChart().querySelectorAll(".tc-label")].map(t => t.textContent);
ok(qLabels.join(",") === "62,61,60", "each reads its week's average, oldest first: " + qLabels.join(","));

console.log("\n-- days inside one bucket collapse into it --");
const monA = weekAgo(0);
c = open({ "dailyReadout.v1": JSON.stringify({
  [monA]: { sleep: 60, _t: 1 },
  [shift(monA, 2)]: { sleep: 70, _t: 1 },
  [shift(monA, 4)]: { sleep: 80, _t: 1 },   // still the same Mon-Sun week
}) });
click(c.w, c.w.document.getElementById("chartsLink"));
setQ("quarter");
ok(!!qChart().querySelector(".empty") && qChart().querySelectorAll(".tc-dot").length === 0,
   "three nights in the same week are one point, which alone is still not a line");
ok(qChart().querySelector(".empty").textContent === "Only one reading in the last 13 weeks.",
   "and it says so: " + qChart().querySelector(".empty").textContent);

console.log("\n-- a second bucket turns that single point into a line --");
c = open({ "dailyReadout.v1": JSON.stringify({
  [monA]: { sleep: 60, _t: 1 },
  [shift(monA, 2)]: { sleep: 80, _t: 1 },        // averages to 70 for week one
  [shift(monA, 7)]: { sleep: 90, _t: 1 },        // the following Monday: week two
}) });
click(c.w, c.w.document.getElementById("chartsLink"));
setQ("quarter");
ok(qChart().querySelectorAll(".tc-dot").length === 2, "two weeks, two points: " + qChart().querySelectorAll(".tc-dot").length);
ok([...qChart().querySelectorAll(".tc-label")].map(t => t.textContent).join(",") === "70,90",
   "the first is the average of its two nights: " + [...qChart().querySelectorAll(".tc-label")].map(t => t.textContent).join(","));
ok(!qChart().querySelector(".empty"), "and a real line now, not the empty state");

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

console.log("\n-- a window picker on every chart --");
// 400 days of daily readings, so every window has something in it
const daily = {};
for (let i = 0; i < 400; i++) daily[shift(TODAY, -i)] = { sleep: 70, hrv: 40, avgHr: 60, cpap: 90, _t: 1 };
c = open({ "dailyReadout.v1": JSON.stringify(daily) });
click(c.w, c.w.document.getElementById("chartsLink"));
const withPicker = [...c.w.document.querySelectorAll(".trend-chart")];
ok(withPicker.every(el => el.querySelector(".tc-period")), "all four carry one");
const opts = [...withPicker[0].querySelectorAll(".tc-period option")].map(o => o.value + ":" + o.textContent);
ok(opts.join(" | ") === "week:Week | month:Month | quarter:Quarter | year:Year",
   "four windows, shortest first: " + opts.join(" | "));
ok(withPicker[0].querySelector(".tc-period").value === "month", "a month by default");

console.log("\n-- the picker sets the window, not a re-cut of the whole log --");
const sleepEl = () => [...c.w.document.querySelectorAll(".trend-chart")][0];
const hrvEl = () => [...c.w.document.querySelectorAll(".trend-chart")][1];
const dotsIn = el => el.querySelectorAll(".tc-dot").length;
const pick = (el, v) => { const s = el.querySelector(".tc-period"); s.value = v;
  s.dispatchEvent(new c.w.Event("change", { bubbles: true })); };

ok(dotsIn(sleepEl()) === 30, "a month is the last 30 days, one point each: " + dotsIn(sleepEl()));
ok(sleepEl().querySelector(".tc-agg").textContent === "Last 30 days", "and says so");

pick(sleepEl(), "week");
ok(dotsIn(sleepEl()) === 7, "a week is the last 7 days: " + dotsIn(sleepEl()));
ok(sleepEl().querySelector(".tc-agg").textContent === "Last 7 days", "labelled as the window");

pick(sleepEl(), "quarter");
ok(dotsIn(sleepEl()) === 14, "a quarter is 13 weeks, plotted per week: " + dotsIn(sleepEl()));
ok(sleepEl().querySelector(".tc-agg").textContent === "Last 13 weeks · weekly average",
   "and names both the window and the bucket");

pick(sleepEl(), "year");
const monthsIn = (from, to) => { const seen = new Set(); let k = from;
  while (k <= to) { seen.add(k.slice(0, 7)); k = shift(k, 1); } return seen.size; };
const yearMonths = monthsIn(shift(TODAY, -364), TODAY);
ok(dotsIn(sleepEl()) === yearMonths,
   "a year is every month it touches, plotted per month: " + dotsIn(sleepEl()) + " of " + yearMonths);
ok(sleepEl().querySelector(".tc-agg").textContent === "Last 12 months · monthly average", "same again");
ok(dotsIn(hrvEl()) === 30, "the chart beside it is left on its own window");

console.log("\n-- nothing outside the window is plotted --");
// one reading today, one 200 days back: only the long windows should see both
c = open({ "dailyReadout.v1": JSON.stringify({
  [TODAY]: { sleep: 70, _t: 1 }, [shift(TODAY, -3)]: { sleep: 72, _t: 1 },
  [shift(TODAY, -200)]: { sleep: 50, _t: 1 } }) });
click(c.w, c.w.document.getElementById("chartsLink"));
ok(dotsIn(sleepEl()) === 2, "the month window ignores the reading 200 days back: " + dotsIn(sleepEl()));
pick(sleepEl(), "year");
const seededMonths = new Set([TODAY, shift(TODAY, -3), shift(TODAY, -200)].map(k => k.slice(0, 7))).size;
ok(dotsIn(sleepEl()) === seededMonths,
   "the year window picks the old one up, one point per month it lands in: " +
   dotsIn(sleepEl()) + " of " + seededMonths);
const yearLabels = [...sleepEl().querySelectorAll(".tc-label")].map(t => t.textContent);
ok(yearLabels.indexOf("50") >= 0, "and the old reading is in there: " + yearLabels.join(","));

console.log("\n-- an empty window says so, and still lets you back out --");
c = open({ "dailyReadout.v1": JSON.stringify({ [shift(TODAY, -200)]: { sleep: 50, _t: 1 } }) });
click(c.w, c.w.document.getElementById("chartsLink"));
ok(!!sleepEl().querySelector(".empty"), "nothing in the last 30 days");
ok(sleepEl().querySelector(".empty").textContent === "Nothing logged in the last 30 days.",
   "and names the window: " + sleepEl().querySelector(".empty").textContent);
ok(!!sleepEl().querySelector(".tc-period"), "the picker is still there to escape with");
pick(sleepEl(), "year");
ok(sleepEl().querySelector(".empty").textContent === "Only one reading in the last 12 months.",
   "one point is not a line, and it says which case it is: " + sleepEl().querySelector(".empty").textContent);

console.log("\n-- the axis reads in the window's own units --");
c = open({ "dailyReadout.v1": JSON.stringify(daily) });
click(c.w, c.w.document.getElementById("chartsLink"));
pick(sleepEl(), "week");
const wTicks = [...sleepEl().querySelectorAll(".tc-tick")].map(t => t.textContent);
ok(wTicks.length >= 2, "a week gets day ticks, not one lonely month: " + wTicks.join(","));
ok(/^[A-Za-z]{3} \d+$/.test(wTicks[0]), "the first names its month: " + wTicks[0]);
// a bare day number, except where the week crosses into a new month -- which
// is the whole point of naming it, so derive where that falls
const weekDays = []; for (let i = 6; i >= 0; i--) weekDays.push(shift(TODAY, -i));
const named = weekDays.filter((k, i) => i === 0 || k.slice(0, 7) !== weekDays[i - 1].slice(0, 7)).length;
ok(wTicks.filter(t => /^[A-Za-z]{3} \d+$/.test(t)).length === named,
   named + " tick(s) name a month, one per month the week touches: " + wTicks.join(","));
ok(wTicks.filter(t => /^\d+$/.test(t)).length === wTicks.length - named,
   "and the rest are bare day numbers: " + wTicks.join(","));
pick(sleepEl(), "year");
const yTicks = [...sleepEl().querySelectorAll(".tc-tick")].map(t => t.textContent);
ok(yTicks.every(t => /^[A-Za-z]{3}( \d\d)?$/.test(t)), "a year gets month ticks: " + yTicks.join(","));

console.log("\n-- the choice is remembered, per chart, and never in the log --");
pick(sleepEl(), "quarter");
pick(hrvEl(), "week");
const stored = JSON.parse(c.jar["dailyReadout.trendPeriod"]);
ok(stored.sleep === "quarter" && stored.hrv === "week", "stored per metric: " + JSON.stringify(stored));
ok(!/trendPeriod/.test(c.jar["dailyReadout.v1"] || ""), "the log is untouched by a view setting");
const reopened = open(c.jar);
click(reopened.w, reopened.w.document.getElementById("chartsLink"));
const back2 = [...reopened.w.document.querySelectorAll(".trend-chart")];
ok(back2[0].querySelector(".tc-period").value === "quarter" &&
   back2[1].querySelector(".tc-period").value === "week", "each comes back where it was left");
ok(back2[2].querySelector(".tc-period").value === "month", "one never touched is still the default month");

console.log("\n-- switching views never touches the log --");
c = open({ "dailyReadout.v1": JSON.stringify(seed) });
const before = c.jar["dailyReadout.v1"];
click(c.w, c.w.document.getElementById("chartsLink"));
click(c.w, c.w.document.getElementById("backToDaily"));
ok(c.jar["dailyReadout.v1"] === before, "the stored log is byte-identical after a round trip through the charts view");

/* One fixed span for all four charts, picked as two months, overriding the
   per-chart windows while it is set. */
{
  console.log("\n-- the date range --");
  // a year of readings, so there is a real span to pick either end of
  const long = {};
  for (let i = 0; i < 380; i++) long[shift(TODAY, -i)] = { sleep: 60 + (i % 25), hrv: 30 + (i % 20), _t: 1 };
  const r = open({ "dailyReadout.v1": JSON.stringify(long) });
  click(r.w, r.w.document.getElementById("chartsLink"));
  const $$ = id => r.w.document.getElementById(id);
  const change = (el, v) => { el.value = v; el.dispatchEvent(new r.w.Event("change", { bubbles: true })); };
  const subs = () => [...r.w.document.querySelectorAll(".tc-agg")].map(e => e.textContent);
  const disabled = () => [...r.w.document.querySelectorAll(".tc-period")].map(s => s.disabled);
  const months = [...$$("rangeFrom").options].map(o => o.value);

  ok(months.length >= 12, "both pickers list every month the log covers: " + months.length);
  ok($$("rangeFrom").options.length === $$("rangeTo").options.length, "From and To offer the same months");
  ok($$("rangeClear").hidden, "no Clear until a range is set");
  ok(subs().every(s => /Last 30 days/.test(s)), "each chart starts on its own window: " + subs()[0]);
  ok(disabled().every(d => d === false), "and its own picker is live");

  const from = months[0], to = months[months.length - 1];
  change($$("rangeFrom"), from);
  change($$("rangeTo"), to);
  ok(JSON.parse(r.jar["dailyReadout.trendRange"]).from === from, "the span is remembered");
  ok(!$$("rangeClear").hidden, "Clear appears");
  ok(subs().every(s => s === subs()[0]) && /–/.test(subs()[0]),
     "all four charts move to the one span: " + subs()[0]);
  ok(/monthly average/.test(subs()[0]), "a span over a quarter plots monthly");
  ok(disabled().every(d => d === true), "and every per-chart picker stands down");

  // a month or less is still plotted day by day, the same rule the rolling windows use
  change($$("rangeFrom"), to); change($$("rangeTo"), to);
  ok(!/average/.test(subs()[0]), "a single month plots daily: " + subs()[0]);
  ok(subs()[0].indexOf("–") < 0, "and reads as one month, not a range from itself: " + subs()[0]);

  // picked the wrong way round, it still means the span between the two
  change($$("rangeFrom"), to); change($$("rangeTo"), from);
  const span = JSON.parse(r.jar["dailyReadout.trendRange"]);
  ok(span.from === from && span.to === to, "a backwards pick is read the sensible way round");

  click(r.w, $$("rangeClear"));
  ok(!r.jar["dailyReadout.trendRange"], "Clear forgets it");
  ok(subs().every(s => /Last 30 days/.test(s)), "and every chart returns to its own window");
  ok(disabled().every(d => d === false), "with its picker live again");

  change($$("rangeFrom"), months[1]);
  const again = open(r.jar);
  click(again.w, again.w.document.getElementById("chartsLink"));
  ok(/–/.test(again.w.document.querySelector(".tc-agg").textContent), "a set span survives a reload");
  ok(!/trendRange/.test(r.jar["dailyReadout.v1"] || ""), "and never reaches the log");
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
