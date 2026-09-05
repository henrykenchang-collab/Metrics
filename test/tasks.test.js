/* Task Reminders sits above Guardrails, same fold shape, but its own
   content: a fixed list due on the 1st of every month, nothing tied to a
   marker or a streak. Guards both dates (due vs. not), that it folds and
   remembers independently of Guardrails, and that it never bleeds into
   the log. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };

function openPinned(dateStr, jar) {
  jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) {
       w.HTMLCanvasElement.prototype.getContext = () => null;
       const R = w.Date, fixed = dateStr + "T12:00:00";
       function F(...a) { return a.length ? new R(...a) : new R(fixed); }
       F.prototype = R.prototype; F.now = () => new R(fixed).getTime(); F.parse = R.parse; F.UTC = R.UTC;
       w.Date = F;
       for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
         Object.defineProperty(w, n, { value: {
           getItem: k => (k in st ? st[k] : null),
           setItem: (k, v) => { st[k] = String(v); },
           removeItem: k => { delete st[k]; },
         }, configurable: true });
     } }).window;
  return { w, jar };
}
const tasks = w => w.document.getElementById("tasks");
const tHead = w => tasks(w).querySelector(".guard-head");
const tBody = w => tasks(w).querySelector(".guard-body");
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

console.log("\n-- not the 1st: quiet --");
let c = openPinned("2026-09-05");
ok(/Task Reminders/.test(tHead(c.w).textContent), "the panel has its own head");
ok(/Not Due/.test(tHead(c.w).textContent), "counts nothing: " + tHead(c.w).textContent.trim());
ok(!!tBody(c.w).querySelector(".guard-clear"), "and reads as all-clear");
ok(!tasks(c.w).classList.contains("alert"), "no alert border either");

console.log("\n-- the 1st: all three come due --");
let f = openPinned("2026-10-01");
ok(/3 Due/.test(tHead(f.w).textContent), "counts three: " + tHead(f.w).textContent.trim());
ok(tasks(f.w).classList.contains("alert"), "and reads as an alert, same as a flagged Guardrails");
const rows = [...tBody(f.w).querySelectorAll(".alert-row")].map(r => r.querySelector(".alert-name").textContent);
ok(rows.join(" | ") === "Shanti Heartworm | CPAP Clean | Expresso Clean",
   "the three tasks, in order: " + rows.join(" | "));

console.log("\n-- it folds, independently of Guardrails --");
ok(tBody(f.w).hidden === false, "open to begin with");
click(f.w, tHead(f.w));
ok(tBody(f.w).hidden === true, "a click shuts it");
ok(tHead(f.w).classList.contains("shut"), "the head marks itself shut");
const guardBody = f.w.document.getElementById("guard").querySelector(".guard-body");
ok(guardBody.hidden === false, "Guardrails' own fold is untouched");

console.log("\n-- remembered, alongside the other panels, never in the log --");
ok(JSON.parse(f.jar["dailyReadout.shut"]).indexOf("tasks") >= 0, "the choice is stored beside the panels'");
ok(!f.jar["dailyReadout.v1"] || !/"tasks"/.test(f.jar["dailyReadout.v1"]), "and never into the log");
const back = openPinned("2026-10-01", f.jar);
ok(tBody(back.w).hidden === true, "shut again on the next load");

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
