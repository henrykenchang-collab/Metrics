/* Average Resting HR, Deep/REM/Light sleep: a second stats row under the
   first, added for the Oura CSV backfill. Guards that they render, record,
   clamp, and export like the original four, without disturbing the first
   row's fixed four-across layout. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
const store = c => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[TODAY] || {};

console.log("\n-- the first row is untouched --");
let c = open({});
ok(c.w.document.querySelectorAll("#stats .stat").length === 4, "still four cells: Sleep, Rest HR, HRV, CPAP");

console.log("\n-- the second row --");
const cells = [...c.w.document.querySelectorAll("#stats2 .stat")];
ok(cells.length === 4, "four more cells");
const labels = cells.map(e => e.querySelector(".stat-label").textContent);
ok(labels.join(" | ") === "Avg HR | Deep | REM | Light", "short labels, in order: " + labels.join(" | "));

console.log("\n-- they read, clamp, and export like any stat --");
const inp = cells.map(e => e.querySelector("input"));
inp[0].value = "58"; inp[0].dispatchEvent(new c.w.Event("input", { bubbles: true }));
inp[1].value = "35"; inp[1].dispatchEvent(new c.w.Event("input", { bubbles: true }));
inp[2].value = "90"; inp[2].dispatchEvent(new c.w.Event("input", { bubbles: true }));
inp[3].value = "700"; inp[3].dispatchEvent(new c.w.Event("input", { bubbles: true }));
inp[3].dispatchEvent(new c.w.Event("blur", { bubbles: true }));
ok(store(c).avgHr === 58 && store(c).deepSleep === 35 && store(c).remSleep === 90, "typing records all three");
ok(store(c).lightSleep === 600, "Light Sleep clamps to its 600 max: " + store(c).lightSleep);
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML), "grid clean");

c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
setTimeout(() => {
  const head = copied.split("\n")[0];
  ok(/Average Resting Heart Rate/.test(head) && /Deep Sleep/.test(head) &&
     /REM Sleep/.test(head) && /Light Sleep/.test(head), "all four columns in the export: " + head);
  const line = copied.split("\n").find(l => l.indexOf(TODAY) === 0) || "";
  ok(/,58,35,90,600,/.test(line), "and the values land in the row: " + line);

  console.log("\n-- an existing day with only the original four still reads --");
  const c2 = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { sleep: 70, hr: 55, hrv: 40, cpap: 88, _t: 1 } }) });
  const cells2 = [...c2.w.document.querySelectorAll("#stats2 .stat input")];
  ok(cells2.every(i => i.value === ""), "the new fields start blank, not zero or NaN, on an old day");
  ok(!/NaN/.test(c2.w.document.getElementById("grid").innerHTML), "and the grid stays clean");

  console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
  process.exit(fail ? 1 : 0);
}, 150);
