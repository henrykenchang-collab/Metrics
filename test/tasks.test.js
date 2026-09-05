/* Task Reminders: a fixed set of monthly to-dos, each due the 1st and
   staying due until it is ticked. Guards the tick surviving a reload, the
   month boundary bringing a task back, an untick putting it back on the
   list, and the panel being absent -- not empty -- once nothing is due.
   Nothing counts before the schedule's own start of 2026-10-01, so every
   pinned date here sits on or after it, except the block that checks what
   happens before. */
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
const panel = w => w.document.getElementById("tasks");
const list  = w => w.document.getElementById("taskList");
const names = el => [...el.querySelectorAll(".taskrow")].map(r => r.querySelector(".alert-name").textContent);
const done  = el => [...el.querySelectorAll(".taskrow.done")].map(r => r.querySelector(".alert-name").textContent);
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

console.log("\n-- nothing counts before the 1st of October 2026 --");
{
  const b = openPinned("2026-09-30");   // the day before it starts
  ok(b.w.document.getElementById("tasks").hidden === true,
     "the readout panel is absent, not showing three overdue tasks");
  click(b.w, b.w.document.getElementById("tasksLink"));
  ok(b.w.document.getElementById("tasksN").textContent === "Starts Oct 2026",
     "the page says when it starts instead of a due count: " + b.w.document.getElementById("tasksN").textContent);
  ok(names(list(b.w)).length === 3, "all three are still listed, so you can see what is coming");
  ok([...list(b.w).querySelectorAll(".taskrow")].every(r => r.disabled),
     "but none is tickable yet");
  click(b.w, list(b.w).querySelectorAll(".taskrow")[0]);
  ok(!b.jar["dailyReadout.tasks"], "and a click on one banks nothing");
  ok(list(b.w).querySelector(".alert-detail").textContent === "Starts Oct 2026",
     "each row says so once, not the whole sentence again: " + list(b.w).querySelector(".alert-detail").textContent);
}

console.log("\n-- and does from the 1st itself --");
{
  const d1 = openPinned("2026-10-01");
  ok(d1.w.document.getElementById("tasks").hidden === false, "the panel is there on the day");
  ok(/3 Due/.test(d1.w.document.querySelector("#tasks .guard-head").textContent), "all three due");
  ok([...d1.w.document.querySelectorAll("#tasks .taskrow")].every(r => !r.disabled), "and tickable");
}

console.log("\n-- the link sits under Lessons Learned --");
let c = openPinned("2026-10-16");
const links = [...c.w.document.querySelectorAll(".viewlinks .viewlink")].map(b => b.textContent.trim());
ok(links.indexOf("Task Reminders →") === links.indexOf("Lessons Learned →") + 1,
   "in order: " + links.join(" | "));

console.log("\n-- due mid-month, not just on the 1st --");
ok(panel(c.w).hidden === false, "the panel shows on the 16th, because nothing has been ticked");
ok(/3 Due/.test(panel(c.w).querySelector(".guard-head").textContent), "counting all three");
ok(names(panel(c.w)).join(" | ") === "Shanti Heartworm | Clean CPAP | Clean Expresso Machine",
   "the three tasks: " + names(panel(c.w)).join(" | "));

console.log("\n-- the readout keeps each task to one line --");
ok([...panel(c.w).querySelectorAll(".taskrow")].every(r => r.classList.contains("tight")),
   "every panel row is the tight variant");
ok([...panel(c.w).querySelectorAll(".alert-detail")].every(d => d.textContent === "Due the 1st"),
   "with the message beside the name, not a sentence under it");
{
  const css = HTML.replace(/\s+/g, " ");
  ok(/\.taskrow\.tight \.alert-body \{[^}]*flex-direction: row/.test(css),
     "and the CSS lays that body out in a row");
}

console.log("\n-- the page lists them too --");
click(c.w, c.w.document.getElementById("tasksLink"));
ok(c.w.document.getElementById("dailyView").hidden === true, "the daily view stands aside");
ok(c.w.document.getElementById("tasksView").hidden === false, "and the page opens");
ok(names(list(c.w)).length === 3, "all three listed, due or not");

console.log("\n-- ticking from the page --");
click(c.w, list(c.w).querySelectorAll(".taskrow")[0]);
ok(done(list(c.w)).join("") === "Shanti Heartworm", "the row marks itself done");
ok(/2 Due/.test(c.w.document.getElementById("tasksN").textContent), "and the count drops");
ok(JSON.parse(c.jar["dailyReadout.tasks"])["shantiHeartworm:2026-10"].done === true,
   "stored per task per month");
ok(!c.jar["dailyReadout.v1"] || !/shantiHeartworm/.test(c.jar["dailyReadout.v1"]),
   "and never into the day log");

console.log("\n-- ticking the rest empties the panel entirely --");
[...list(c.w).querySelectorAll(".taskrow")].forEach(r => { if (!r.classList.contains("done")) click(c.w, r); });
ok(c.w.document.getElementById("tasksN").textContent === "All Done", "the page says so");
click(c.w, c.w.document.getElementById("backFromTasks"));
ok(panel(c.w).hidden === true, "the panel is gone, not showing an all-clear line");
ok(panel(c.w).innerHTML === "", "and carries no markup to render");

console.log("\n-- it stays gone for the rest of the month, and comes back the next --");
ok(openPinned("2026-10-30", c.jar).w.document.getElementById("tasks").hidden === true, "still gone on the 30th");
const nov = openPinned("2026-11-01", c.jar);
ok(nov.w.document.getElementById("tasks").hidden === false, "back on November 1st");
ok(names(panel(nov.w)).length === 3, "all three due again");

console.log("\n-- ticking from the panel itself --");
click(nov.w, panel(nov.w).querySelector(".taskrow"));
ok(names(panel(nov.w)).join(" | ") === "Clean CPAP | Clean Expresso Machine",
   "the ticked one drops off: " + names(panel(nov.w)).join(" | "));

console.log("\n-- an untick puts it back, and records that it did --");
const back = openPinned("2026-11-02", nov.jar);
click(back.w, back.w.document.getElementById("tasksLink"));
click(back.w, list(back.w).querySelector(".taskrow.done"));
ok(names(panel(back.w)).length === 3, "due again once unticked");
ok(JSON.parse(back.jar["dailyReadout.tasks"])["shantiHeartworm:2026-11"].done === false,
   "stored as false rather than deleted, so the untick survives a merge");

console.log("\n-- the page's history line --");
const dec = openPinned("2026-12-03", nov.jar);
click(dec.w, dec.w.document.getElementById("tasksLink"));
const detail = [...list(dec.w).querySelectorAll(".taskrow")]
  .map(r => r.querySelector(".alert-detail").textContent);
// all three were ticked back in October, so all three carry that history
ok(detail.every(d => /last done Oct 2026/.test(d)),
   "names the month last ticked, with a four-digit year: " + detail[0]);
// a task never ticked has nothing to name
const fresh = openPinned("2026-12-03");
click(fresh.w, fresh.w.document.getElementById("tasksLink"));
ok([...list(fresh.w).querySelectorAll(".taskrow")]
     .every(r => /not done yet/.test(r.querySelector(".alert-detail").textContent)),
   "and says so when there is no history");

console.log("\n-- the view hides itself properly --");
const css = HTML.replace(/\s+/g, " ");
ok(new RegExp("(^|\\}|,)[^{}]*#tasksView\\[hidden\\][^{}]*\\{[^}]*display: none").test(css),
   "#tasksView carries its own [hidden] rule, like the other views");

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
