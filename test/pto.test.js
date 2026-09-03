/* PTO: a record of the day, not a habit. A plain checkbox like any other
   Daily Marker -- counts toward Markers Due Today, exports, shows in the
   month grid -- but carries no streak pill, no start-date field, and never
   trips a Guardrails lapse, since a running streak of vacation days (or an
   alert for "you haven't taken PTO in 5 days") would be nonsensical. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = iso(new Date());
const back = n => shift(TODAY, -n);
let copied = "";

function open(jar) {
  jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      Object.defineProperty(w.navigator, "clipboard", { value: { writeText: t => { copied = t; return Promise.resolve(); } }, configurable: true });
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const row = w => [...w.document.querySelectorAll("#rows > .row, #petrows > .row")]
  .find(b => b.querySelector(".row-code").textContent === "PTO");
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const store = (c, k) => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[k] || {};

console.log("\n-- a plain box, no streak furniture --");
{
  const c = open({});
  const r = row(c.w);
  ok(!!r, "the PTO row exists");
  ok(!r.querySelector(".streak"), "no streak pill");
  ok(!r.querySelector(".mstart-wrap"), "no start-date field -- nothing here for one to gate");
  ok([...r.children].map(el => el.className).join(" | ") === "code row-code | row-name | cell",
     "just the code, the name, and the checkbox");
}

console.log("\n-- an ordinary checkbox otherwise --");
{
  const c = open({});
  const r = row(c.w);
  ok(!r.classList.contains("notdue"), "due like any unscheduled marker");
  const before = c.w.document.getElementById("scoreD").textContent;
  click(c.w, r);
  ok(store(c, TODAY).pto === true, "checking it records");
  ok(c.w.document.getElementById("scoreD").textContent === before,
     "counted in the denominator whether checked or not, so the total is unaffected: " + before);
  click(c.w, r);
  ok(store(c, TODAY).pto === undefined, "unchecking it clears the record");
}

console.log("\n-- never a Guardrails lapse --");
{
  // ten days logged, PTO never checked once
  const seed = {};
  for (let i = 0; i < 10; i++) seed[back(i)] = { vitamins: true, _t: 1 };
  const c = open({ "dailyReadout.v1": JSON.stringify(seed) });
  ok(!/PTO/.test(c.w.document.getElementById("guard").textContent),
     "ten unchecked days never trips a lapse: " + c.w.document.getElementById("guard").textContent.slice(0, 160));
}

console.log("\n-- still exports and shows on the month grid, like any other marker --");
{
  const c = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { pto: true, vitamins: true, _t: 1 } }) });
  const gl = [...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e => e.textContent);
  ok(gl.includes("PTO"), "a month-grid row like any other Daily Marker: " + gl.join(","));
  c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
  setTimeout(() => {
    const head = copied.split("\n")[0];
    ok(/,PTO,/.test(head), "an export column: " + head);
    const line = copied.split("\n").find(l => l.indexOf(TODAY) === 0) || "";
    const col = head.split(",").indexOf("PTO");
    ok(line.split(",")[col] === "Yes", "and the day it happened reads Yes: " + line.split(",")[col]);

    console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
    process.exit(fail ? 1 : 0);
  }, 150);
}
