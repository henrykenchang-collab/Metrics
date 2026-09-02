/* Motivation: a third Bad/Average/Good row, under Mood. Most of what a
   choice row does is driven off CHOICE_ROWS, so this guards the things that
   follow automatically (the month-grid row, the chip, the export column) as
   well as the two that had to be wired by hand (Patterns and guardrails). */
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
const rowNamed = (w, name) => [...w.document.getElementById("choices").children]
  .find(r => r.querySelector(".rate-name").textContent === name);
const store = c => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[TODAY] || {};
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

console.log("\n-- the row, and where it sits --");
let c = open({});
const names = [...c.w.document.getElementById("choices").children].map(r => r.querySelector(".rate-name").textContent);
ok(names.join(" | ") === "Mood | Motivation | Verbal Fluency", "directly under Mood: " + names.join(" | "));
const mot = rowNamed(c.w, "Motivation");
const pills = [...mot.querySelectorAll(".pill")];
ok(pills.map(p => p.textContent).join(",") === "Bad,Average,Good", "three verdicts: " + pills.map(p => p.textContent).join(","));
ok(pills.length === 3, "and no N/A -- unlike Verbal Fluency, it is asked every day");
ok(pills.every(p => p.className === "pill"), "the same pill Mood uses");

console.log("\n-- it records, toggles off, and never touches its neighbours --");
click(c.w, pills[2]);
ok(store(c).motivation === "good", "picking Good records it: " + store(c).motivation);
ok(store(c).mood === undefined && store(c).fluency === undefined, "Mood and Fluency are untouched");
ok(pills[2].classList.contains("on") && !pills[0].classList.contains("on"), "only the one picked lights up");
click(c.w, pills[2]);
ok(store(c).motivation === undefined, "clicking it again clears it");
click(c.w, pills[0]);
ok(store(c).motivation === "bad", "and a different verdict replaces it: " + store(c).motivation);

console.log("\n-- a day with only Motivation on it still counts as logged --");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML), "grid clean");
ok(c.w.document.getElementById("scoreD").textContent !== "", "the readout still renders");

console.log("\n-- the month grid --");
const labels = [...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e => e.textContent);
ok(labels.includes("MOT"), "and a MOT row on the month grid: " + labels.join(","));
ok(labels.indexOf("MOT") === labels.indexOf("MOOD") + 1, "sitting under MOOD there too");

console.log("\n-- Patterns can ask what moves it --");
const outBtns = [...c.w.document.getElementById("outcome").children];
const motBtn = outBtns.find(b => b.textContent === "Motivation");
ok(!!motBtn, "it is pickable as an outcome: " + outBtns.map(b => b.textContent).join(" | "));
click(c.w, motBtn);
ok(!/NaN/.test(c.w.document.getElementById("facts").innerHTML), "and switching to it renders without NaN");

console.log("\n-- and it can trip a guardrail, on Mood's threshold --");
const seed = {};
for (let i = 0; i < 7; i++) seed[shift(TODAY, -i)] = { motivation: "bad", vitamins: true, _t: 1 };
for (let i = 7; i < 14; i++) seed[shift(TODAY, -i)] = { motivation: "good", vitamins: true, _t: 1 };
const g = open({ "dailyReadout.v1": JSON.stringify(seed) });
ok(/Motivation/.test(g.w.document.getElementById("guard").textContent),
   "a fall from Good to Bad over the week is flagged");

console.log("\n-- the export carries it --");
const e = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { motivation: "avg", mood: "good", _t: 1 } }) });
e.w.document.getElementById("copyBtn").dispatchEvent(new e.w.MouseEvent("click", { bubbles: true }));
setTimeout(() => {
  const head = copied.split("\n")[0];
  ok(/Motivation/.test(head), "a Motivation column: " + head.slice(0, 100));
  ok(head.indexOf("Mood") < head.indexOf("Motivation"), "after Mood, matching the screen");
  const line = copied.split("\n").find(l => l.indexOf(TODAY) === 0) || "";
  ok(/Average/.test(line) && /Good/.test(line), "with the words, not the codes: " + line.slice(-40));
  console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
  process.exit(fail ? 1 : 0);
}, 150);
