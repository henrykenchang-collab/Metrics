/* The dose checklist under Vitamins: Magnesium, ADK, D, B1, B12, Theanine,
   Ashwagandha. Unlike a marker, it starts CHECKED -- the ordinary day is
   every dose taken, so only a skipped one is worth writing down -- and it
   never enters MARKERS: no streak, no month-grid row, no guardrail trend, no
   Patterns factor, no export column. This guards both halves: that the
   checklist itself works, and that it really does stay untracked elsewhere. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = iso(new Date());
let copied = "";

function open(jar) { jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      Object.defineProperty(w.navigator, "clipboard", { value: { writeText: t => { copied = t; return Promise.resolve(); } }, configurable: true });
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const pill = (w, label) => [...w.document.querySelectorAll("#vitDosesBody .dose-pill")]
  .find(b => b.textContent === label);
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const day = (c, k) => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[k] || {};

console.log("\n-- it sits directly under Vitamins --");
let c = open({});
const rows = [...c.w.document.getElementById("rows").children];
const iVit = rows.findIndex(el => el.querySelector && el.querySelector(".row-code") && el.querySelector(".row-code").textContent === "VIT");
const iVitwrap = rows.findIndex(el => el.id === "vitDosesHead" || (el.querySelector && el.querySelector("#vitDosesHead")));
ok(iVit === 0, "Vitamins is the first row: index " + iVit);
ok(iVitwrap === iVit + 1, "the dose checklist is the very next thing: index " + iVitwrap);
ok(!c.w.document.getElementById("vitDosesHead").closest(".row"),
   "it is its own block, not inside the Vitamins row itself");

console.log("\n-- it folds, shut by default --");
{
  const head = c.w.document.getElementById("vitDosesHead");
  const body = c.w.document.getElementById("vitDosesBody");
  ok(body.hidden === true, "shut on a log that has never been folded");
  ok(head.querySelector(".chev"), "carries a chevron like every other fold");
  ok(head.getAttribute("aria-expanded") === "false", "and says so");
  click(c.w, head);
  ok(body.hidden === false, "opens on click");
  ok(c.w.document.querySelectorAll("#vitDosesBody .dose-pill").length === 7,
     "seven doses, there all along -- opening does not build them");
  click(c.w, head);
  ok(body.hidden === true, "and shuts again");
  const stored = JSON.parse(c.jar["dailyReadout.shut"]);
  ok(stored.indexOf("vitDoses") >= 0, "remembered like any other fold: " + stored.join(", "));
}

console.log("\n-- the seven, all checked by default --");
c = open({});
const names = ["Magnesium", "ADK", "D", "B1", "B12", "Theanine", "Ashwagandha"];
ok(names.every(n => !!pill(c.w, n)), "all seven are offered: " + names.filter(n => !pill(c.w, n)).join(","));
ok(names.every(n => pill(c.w, n).classList.contains("on")),
   "every one reads checked with nothing logged yet");
ok(Object.keys(day(c, TODAY)).length === 0, "and nothing is written to the day just for opening it");

console.log("\n-- unchecking one records only the exception --");
click(c.w, pill(c.w, "B12"));
ok(day(c, TODAY).vitB12 === false, "B12 is explicitly false");
ok(!("vitMag" in day(c, TODAY)), "Magnesium is never mentioned -- still just the default");
ok(!pill(c.w, "B12").classList.contains("on"), "and it reads unchecked");
ok(pill(c.w, "Magnesium").classList.contains("on"), "the rest are unaffected");
click(c.w, pill(c.w, "B12"));
ok(!("vitB12" in day(c, TODAY)), "checking it again removes the exception entirely");
ok(pill(c.w, "B12").classList.contains("on"), "back to reading checked");

console.log("\n-- clicking a dose does not touch the Vitamins marker underneath it --");
c = open({});
click(c.w, pill(c.w, "D"));
ok(day(c, TODAY).vitamins === undefined, "the Vitamins row itself is still untouched");
ok(c.w.document.querySelector('.row .row-code').textContent === "VIT" &&
   !c.w.document.querySelector('.row.on'), "no row reads on");

console.log("\n-- a new day starts fresh, all checked again --");
c = open({ "dailyReadout.v1": JSON.stringify({ [shift(TODAY, -1)]: { vitB1: false, vitamins: true, _t: 1 } }) });
ok(pill(c.w, "B1").classList.contains("on"), "yesterday's skipped B1 does not carry over to today");

console.log("\n-- none of it is tracked anywhere else --");
{
  // a month of every dose skipped must not move a single one of: the
  // Vitamins streak, a guardrail, the month grid, or Patterns
  const seed = {};
  for (let i = 0; i < 30; i++) {
    seed[shift(TODAY, -i)] = {
      vitamins: true, ePre: 4, _t: 1,
      vitMag: false, vitADK: false, vitD: false, vitB1: false,
      vitB12: false, vitTheanine: false, vitAshwagandha: false
    };
  }
  const w2 = open({ "dailyReadout.v1": JSON.stringify(seed) });
  const vitRow = [...w2.w.document.getElementById("rows").querySelectorAll(".row")]
    .find(b => b.querySelector(".row-code").textContent === "VIT");
  ok(vitRow.querySelector(".streak").textContent.endsWith("d") &&
     !vitRow.querySelector(".streak").textContent.startsWith("-"),
     "the Vitamins streak is unbroken by 30 days of every dose skipped: " + vitRow.querySelector(".streak").textContent);
  ok(!/Magnesium|ADK|Theanine|Ashwagandha/.test(w2.w.document.getElementById("guard").textContent),
     "no guardrail names a single dose");
  const gridLabels = [...w2.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e => e.textContent);
  ok(!gridLabels.some(l => /MAG|ADK|THE|ASH/.test(l)), "no month-grid row for any dose: " + gridLabels.join(","));
  const factorNames = [...w2.w.document.getElementById("outcome").children].map(b => b.textContent)
    .concat([...w2.w.document.querySelectorAll("#facts .fact-name")].map(e => e.textContent));
  ok(!names.some(n => factorNames.indexOf(n) >= 0), "not a Patterns outcome or factor either");
}

console.log("\n-- the dose pills are small --");
ok(/\.dose-pill \{[^}]*font-size: 8px/.test(HTML), "kept small, well below the Factors tags' 11px");

console.log("\n-- and the export never mentions them --");
c = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { vitamins: true, vitB12: false, _t: 1 } }) });
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
setTimeout(() => {
  const head = copied.split("\n")[0];
  ok(!/Magnesium|ADK|Theanine|Ashwagandha|\bB12\b|\bB1\b/.test(head), "no dose column in the export header: " + head.slice(0, 160));
  console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
  process.exit(fail ? 1 : 0);
}, 150);
