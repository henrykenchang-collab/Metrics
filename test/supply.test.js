const fs = require("fs");
const { JSDOM } = require("jsdom");
const BUILT = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const wrap = (b) => "<!doctype html><html><head><meta charset='utf-8'></head><body>" + b + "</body></html>";

const iso = (d) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// build a log: pack opened `days` ago, `perDay` taken each day since
function log(days, perDay, size) {
  const out = {};
  for (let i = days; i >= 0; i--) {
    const k = back(i), d = { irTaken: typeof perDay === "function" ? perDay(days - i) : perDay, _t: 1 };
    if (i === days) d.irFill = size;
    out[k] = d;
  }
  return { "dailyReadout.v1": JSON.stringify(out) };
}

function open(jar) {
  const dom = new JSDOM(wrap(BUILT), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null;
      Object.defineProperty(w, "localStorage", { value: {
        getItem: (k) => (k in jar ? jar[k] : null), setItem: (k,v) => { jar[k] = String(v); }, removeItem: (k) => { delete jar[k]; },
      }, configurable: true });
    }});
  return dom.window;
}
const txt = (w, id) => w.document.getElementById(id).textContent.replace(/\s+/g, " ").trim();
const guard = (w) => w.document.getElementById("guard").textContent.replace(/\s+/g, " ").trim();

console.log("\n-- no pack yet --");
let w = open({});
ok(txt(w, "packHead") === "No Pack", "header says no pack");
ok(/Put the pack size in Refill/.test(txt(w, "packBody")), "explains how to start one");
ok(!/IR Supply/.test(guard(w)), "stays quiet with no pack open");

console.log("\n-- on pace: 9 days in, 1 a day --");
w = open(log(9, 1, 30));            // day 1..10 -> 10 doses over 10 days
ok(txt(w, "packHead") === "Pack of 30", "header names the pack size");
ok(/^20\/30/.test(txt(w, "packBody")), "20 of 30 left");
ok(/Day 10 of 30/.test(txt(w, "packBody")), "day 10 of 30");
ok(/On a 1-a-day pace/.test(txt(w, "packBody")), "reads as on pace");
ok(!/IR Supply/.test(guard(w)), "no guardrail flag when on pace");

console.log("\n-- over pace: 9 days in, 2 a day --");
w = open(log(9, 2, 30));            // 20 doses over 10 days
ok(/^10\/30/.test(txt(w, "packBody")), "10 left");
ok(/2\.0 a day/.test(txt(w, "packBody")), "reports the real rate");
ok(/runs out/.test(txt(w, "packBody")), "projects a run-out date");
ok(/days.{0,3} before a 30-day pack should/.test(txt(w, "packBody")), "says how early");
ok(/IR Supply/.test(guard(w)), "guardrail flags it");
ok(/10 left/.test(guard(w)) && /2\.0 a day/.test(guard(w)), "guardrail carries the numbers");

console.log("\n-- the arithmetic of running early --");
// 10 left at 2.0/day = 5 more days. Pack opened 9 days ago, due to last 30 days
// -> should end on day 30, actually ends on day 15: 15 days early.
ok(/15 days.{0,3} before/.test(txt(w, "packBody")), "15 days early is right for 2 a day from day 10");

console.log("\n-- under pace --");
w = open(log(9, (i) => (i % 2 ? 1 : 0), 30));   // ~0.5 a day
ok(/under 1/.test(txt(w, "packBody")), "reads as under pace");
ok(/should last past/.test(txt(w, "packBody")), "says it will stretch");
ok(!/IR Supply/.test(guard(w)), "no flag for going under");

console.log("\n-- empty pack --");
w = open(log(9, 3, 30));            // 30 doses over 10 days
ok(/^0\/30/.test(txt(w, "packBody")), "0 left");
ok(/pack is empty/i.test(txt(w, "packBody")), "says empty");
ok(/empty/i.test(guard(w)), "guardrail says empty");

console.log("\n-- taken past the pack --");
w = open(log(9, 4, 30));            // 40 doses against a 30 pack
ok(/10.{0,3} taken past it/.test(txt(w, "packBody")), "counts the overshoot");

console.log("\n-- a refill starts a new pack --");
const jar = log(40, 1, 30);         // an old pack, long gone
const days = JSON.parse(jar["dailyReadout.v1"]);
days[back(4)] = { irFill: 30, irTaken: 1, _t: 2 };   // new pack 5 days ago
jar["dailyReadout.v1"] = JSON.stringify(days);
w = open(jar);
ok(/Day 5 of 30/.test(txt(w, "packBody")), "counts from the newest refill, not the old one");
ok(/^25\/30/.test(txt(w, "packBody")), "only doses since the refill count against it");

console.log("\n-- quiet early on --");
w = open(log(1, 3, 30));            // heavy, but only 2 days in
ok(!/IR Supply/.test(guard(w)), "waits a few days before judging the pace");

console.log("\n-- day with only a stamp is not 'logged' --");
w = open(log(9, 1, 30));
ok(!/Nothing Logged/.test(guard(w)), "the supply fields count as a logged day");

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
