/* Lessons Learned: a third view, one page per day like the Journal panel it
   borrows its shape from, split into what worked and what didn't. Each half
   carries its own freeform note and its own pick of tags, drawn from one
   shared, growing vocabulary -- typed once, offered on every day after,
   the same mechanism Factors and the meal categories already use. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const TODAY = iso(new Date());

function open(jar) {
  jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const input = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const day = c => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[TODAY] || {};

console.log("\n-- the link sits right under Trend Charts --");
{
  const c = open({});
  const links = c.w.document.querySelector(".viewlinks");
  ok(!!links, "the two links share a wrapper");
  const kids = [...links.children];
  ok(kids[0].id === "chartsLink" && kids[1].id === "lessonsLink",
     "Trend Charts first, Lessons Learned directly underneath");
  ok(c.w.document.getElementById("lessonsLink").textContent === "Lessons Learned →",
     "labelled plainly");
}

console.log("\n-- opening it --");
{
  const c = open({});
  ok(c.w.document.getElementById("lessonsView").hidden === true, "shut to begin with");
  click(c.w, c.w.document.getElementById("lessonsLink"));
  ok(c.w.document.getElementById("dailyView").hidden === true, "the daily view steps aside");
  ok(c.w.document.getElementById("lessonsView").hidden === false, "and this one takes over");
  ok(c.w.document.getElementById("lessonsFor").textContent.length > 0, "it says which day it is for");
  ok(/Lessons Learned: Positive/.test(c.w.document.getElementById("lessonsView").textContent),
     "Positive section present");
  ok(/Lessons Learned: Negative/.test(c.w.document.getElementById("lessonsView").textContent),
     "Negative section present");
  click(c.w, c.w.document.getElementById("backFromLessons"));
  ok(c.w.document.getElementById("lessonsView").hidden === true, "and back again closes it");
  ok(c.w.document.getElementById("dailyView").hidden === false, "returning to the daily view");
}

console.log("\n-- freeform text, independently for each half --");
{
  const c = open({});
  click(c.w, c.w.document.getElementById("lessonsLink"));
  input(c.w, c.w.document.getElementById("lessonsPosText"), "Slept 8 hours, felt sharp all day");
  input(c.w, c.w.document.getElementById("lessonsNegText"), "Skipped the gym, regretted it by evening");
  ok(day(c).lessonsPos === "Slept 8 hours, felt sharp all day", "positive note recorded");
  ok(day(c).lessonsNeg === "Skipped the gym, regretted it by evening", "negative note recorded, separately");
  input(c.w, c.w.document.getElementById("lessonsPosText"), "");
  ok(day(c).lessonsPos === undefined, "clearing one leaves the other untouched");
  ok(day(c).lessonsNeg === "Skipped the gym, regretted it by evening", "negative note still there");
}

console.log("\n-- tags: typed once, offered on both, selected independently --");
{
  const c = open({});
  click(c.w, c.w.document.getElementById("lessonsLink"));
  click(c.w, c.w.document.getElementById("lessonsPosTagList").querySelector(".tag.add"));
  const posInput = c.w.document.getElementById("lessonsPosTagInput");
  input(c.w, posInput, "Good Sleep");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  ok(day(c).lessonsPosTags && day(c).lessonsPosTags.indexOf("Good Sleep") >= 0,
     "the new tag lands on the Positive side");
  ok(!day(c).lessonsNegTags, "and not on the Negative side");

  const negTags = [...c.w.document.getElementById("lessonsNegTagList").children].map(b => b.textContent);
  ok(negTags.indexOf("Good Sleep") >= 0,
     "but it is offered there too -- one shared, growing vocabulary: " + negTags.join(","));

  const negBtn = [...c.w.document.getElementById("lessonsNegTagList").children].find(b => b.textContent === "Good Sleep");
  click(c.w, negBtn);
  ok(day(c).lessonsNegTags && day(c).lessonsNegTags.indexOf("Good Sleep") >= 0,
     "picking it on the Negative side records it there too");
  ok(day(c).lessonsPosTags.indexOf("Good Sleep") >= 0, "without disturbing the Positive pick");

  const jar2 = JSON.parse(c.jar["dailyReadout.lessonTags"] || "[]");
  ok(jar2.indexOf("Good Sleep") >= 0, "and the vocabulary itself is stored, ready for the next day");
}

console.log("\n-- it comes back on reopening, and reflects the day it is for --");
{
  const c = open({});
  click(c.w, c.w.document.getElementById("lessonsLink"));
  input(c.w, c.w.document.getElementById("lessonsPosText"), "Good focus after a walk");
  click(c.w, c.w.document.getElementById("backFromLessons"));
  click(c.w, c.w.document.getElementById("prev"));       // yesterday, nothing written there
  click(c.w, c.w.document.getElementById("lessonsLink"));
  ok(c.w.document.getElementById("lessonsPosText").value === "",
     "a day with nothing written starts blank");
  click(c.w, c.w.document.getElementById("backFromLessons"));
  click(c.w, c.w.document.getElementById("next"));        // back to today
  click(c.w, c.w.document.getElementById("lessonsLink"));
  ok(c.w.document.getElementById("lessonsPosText").value === "Good focus after a walk",
     "today's note is still there");
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
