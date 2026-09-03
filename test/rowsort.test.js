/* Daily Markers: what's actually worth doing today stays together at the
   top, and what's not due today sinks to the bottom -- so the list is a
   punch list for right now, not just a fixed catalogue of everything the
   app tracks. Order within each half is untouched: MARKERS declaration
   order, same as before this existed. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };

// a pinned Wednesday, well after every marker's own `since`, so the mix of
// due and not-due markers that day is entirely about the weekly schedule
function open(fakeToday) {
  const sess = { "dailyReadout.cur": JSON.stringify({ d: fakeToday, on: fakeToday }) };
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      const R = w.Date, f = fakeToday + "T12:00:00";
      function F(...a) { return a.length ? new R(...a) : new R(f); }
      F.prototype = R.prototype; F.now = () => new R(f).getTime(); F.parse = R.parse; F.UTC = R.UTC; w.Date = F;
      for (const [n, st] of [["localStorage", {}], ["sessionStorage", sess]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return w;
}
const codes = w => [...w.document.getElementById("rows").children]
  .filter(el => el.classList && el.classList.contains("row"))
  .map(el => el.querySelector(".row-code").textContent);

const w = open("2026-09-09");   // Wednesday
const DUE = ["VIT", "GRN", "KET", "CLD", "RUN", "WWK", "RDG", "LGT", "TH", "YT", "PTO"];
const NOTDUE = ["SAU", "GYM"];

console.log("\n-- due markers stay together at the top, in schema order --");
const order = codes(w);
ok(order.join(",") === DUE.concat(NOTDUE).join(","),
   "VIT..YT due, then SAU and GYM not due: " + order.join(","));

console.log("\n-- Vitamin Details rides along right after the Vitamins row --");
const rows = [...w.document.getElementById("rows").children];
const vitIdx = rows.findIndex(el => el.classList.contains("row") && el.querySelector(".row-code").textContent === "VIT");
ok(rows[vitIdx + 1] && rows[vitIdx + 1].classList.contains("vitwrap"),
   "the wrap sits directly after the Vitamins row");

console.log("\n-- it re-sorts on a day where the split is different --");
// Saturday: only the schedule-free markers plus Artificial Daylight are due;
// everything with a weekly schedule (Sauna, Greens, Cold Plunge, Run, Gym,
// Walk (Work), Read) is off, so almost the whole list flips to the bottom
const wSat = open("2026-09-12");
const orderSat = codes(wSat);
const DUE_SAT = ["VIT", "KET", "LGT", "TH", "YT", "PTO"];
const NOTDUE_SAT = ["SAU", "GRN", "CLD", "RUN", "GYM", "WWK", "RDG"];
ok(orderSat.join(",") === DUE_SAT.concat(NOTDUE_SAT).join(","),
   "a different split, same rule -- due first, schema order within each half: " + orderSat.join(","));

console.log("\n-- Shanti and Buddha's own panel is untouched by any of this --");
const pet = [...w.document.getElementById("petrows").children].map(el => el.querySelector(".row-code").textContent);
ok(pet.join(",") === "WLK,BUD,SHA", "still declaration order, not due/not-due split: " + pet.join(","));

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
