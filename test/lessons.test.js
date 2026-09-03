/* Lessons Learned: a third view, and a cumulative log rather than a page
   per day -- each entry carries its own date, one tag from a shared,
   growing vocabulary (the same mechanism Factors and the meal categories
   already use), and a freeform note. Positive and Negative are two
   independent lists, entirely unaffected by whichever day the daily view
   happens to be showing. */
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
const rows = (w, p) => [...w.document.getElementById("lessons" + p + "List").children];
const openView = c => click(c.w, c.w.document.getElementById("lessonsLink"));
const openForm = (c, p, entryRow) => click(c.w, entryRow || c.w.document.getElementById("lessons" + p + "AddBtn"));
const fill = (c, p, { date, note } = {}) => {
  if (date !== undefined) input(c.w, c.w.document.getElementById("lessons" + p + "Date"), date);
  if (note !== undefined) input(c.w, c.w.document.getElementById("lessons" + p + "Note"), note);
};
const save = (c, p) => click(c.w, c.w.document.getElementById("lessons" + p + "Save"));
const stored = c => JSON.parse(c.jar["dailyReadout.lessons"] || "{}");

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

console.log("\n-- actually hidden, not just marked hidden --");
{
  // `display: flex` on its own beats the browser's built-in
  // `[hidden] { display: none }` -- author CSS always wins over that
  // default, whatever the specificity -- so both views need their own
  // `[hidden]` rule restating it, or jsdom's `.hidden === true` above
  // would be true while a real browser renders the view anyway, stacked
  // right under the daily view it was supposed to replace.
  const css = HTML.replace(/\s+/g, " ");
  ok(/#chartsView\[hidden\], ?#lessonsView\[hidden\] \{[^}]*display: none/.test(css) ||
     (/#chartsView\[hidden\][^{,]*\{[^}]*display: none/.test(css) &&
      /#lessonsView\[hidden\][^{,]*\{[^}]*display: none/.test(css)),
     "both carry an explicit [hidden] rule");
}

console.log("\n-- opening it: no per-day framing left --");
{
  const c = open({});
  ok(c.w.document.getElementById("lessonsView").hidden === true, "shut to begin with");
  openView(c);
  ok(c.w.document.getElementById("dailyView").hidden === true, "the daily view steps aside");
  ok(c.w.document.getElementById("lessonsView").hidden === false, "and this one takes over");
  ok(!c.w.document.getElementById("lessonsFor"), "no \"For <date>\" line -- this isn't a page per day");
  ok(!/What Went Well/.test(c.w.document.getElementById("lessonsView").textContent),
     "\"What Went Well\" is gone");
  ok(!/What Didn't/.test(c.w.document.getElementById("lessonsView").textContent),
     "\"What Didn't\" is gone too");
  ok(/Lessons Learned: Positive/.test(c.w.document.getElementById("lessonsView").textContent),
     "the Positive section header stays");
  ok(/Lessons Learned: Negative/.test(c.w.document.getElementById("lessonsView").textContent),
     "the Negative section header stays");
  // generated CSS content (::before) never shows up in jsdom's textContent
  // -- it doesn't run layout -- so check the rule exists instead
  ok(/\.lessonlist:empty::before \{[^}]*content: "Nothing logged yet\."/.test(HTML.replace(/\s+/g, " ")),
     "an empty list says so");
  click(c.w, c.w.document.getElementById("backFromLessons"));
  ok(c.w.document.getElementById("lessonsView").hidden === true, "and back again closes it");
  ok(c.w.document.getElementById("dailyView").hidden === false, "returning to the daily view");
}

console.log("\n-- adding an entry: date, tag and note, its own row --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  ok(c.w.document.getElementById("lessonsPosForm").hidden === false, "the form opens");
  ok(c.w.document.getElementById("lessonsPosDate").value === TODAY, "defaults to today");
  fill(c, "Pos", { date: "2026-01-05", note: "Slept 8 hours, felt sharp all day" });
  save(c, "Pos");
  ok(c.w.document.getElementById("lessonsPosForm").hidden === true, "the form closes on save");
  const list = rows(c.w, "Pos");
  ok(list.length === 1, "one row now");
  ok(list[0].querySelector(".lessonrow-date").textContent === "1/5/26", "short-format date: " + list[0].querySelector(".lessonrow-date").textContent);
  ok(list[0].querySelector(".lessonrow-text").textContent === "Slept 8 hours, felt sharp all day", "the note");
  ok(rows(c.w, "Neg").length === 0, "the Negative list is untouched");
  ok(stored(c).positive.length === 1 && stored(c).positive[0].date === "2026-01-05", "persisted with its own date");
}

console.log("\n-- a note is required, a tag is not --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  save(c, "Pos");
  ok(c.w.document.getElementById("lessonsPosForm").hidden === false, "blank note refuses to save, form stays open");
  fill(c, "Pos", { note: "Good focus after a walk" });
  save(c, "Pos");
  ok(rows(c.w, "Pos").length === 1, "saves fine with no tag picked");
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-tag").textContent === "", "tag column is blank, not \"undefined\"");
}

console.log("\n-- tags: typed once, offered on both, one pick per entry --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Good Sleep");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  ok(c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.on").textContent === "Good Sleep",
     "typing a new tag picks it immediately");
  fill(c, "Pos", { note: "Great night" });
  save(c, "Pos");
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-tag").textContent === "Good Sleep", "lands on the row");

  openForm(c, "Neg");
  const negTags = [...c.w.document.getElementById("lessonsNegTagPick").children].map(b => b.textContent);
  ok(negTags.indexOf("Good Sleep") >= 0,
     "offered on the Negative form too -- one shared, growing vocabulary: " + negTags.join(","));
  const negBtn = [...c.w.document.getElementById("lessonsNegTagPick").children].find(b => b.textContent === "Good Sleep");
  click(c.w, negBtn);
  fill(c, "Neg", { note: "Poor night" });
  save(c, "Neg");
  ok(rows(c.w, "Neg")[0].querySelector(".lessonrow-tag").textContent === "Good Sleep",
     "picking it on the Negative side records it there too, independently");
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-tag").textContent === "Good Sleep",
     "without disturbing the Positive entry");

  const jar2 = JSON.parse(c.jar["dailyReadout.lessonTags"] || "[]");
  ok(jar2.indexOf("Good Sleep") >= 0, "and the vocabulary itself is stored, ready for next time");
}

console.log("\n-- tapping a picked tag again clears the pick --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Diet");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  const pick = () => c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag:not(.add)");
  ok(pick().classList.contains("on"), "picked after adding");
  click(c.w, pick());
  ok(!pick().classList.contains("on"), "tapping it again clears the pick");
}

console.log("\n-- editable: clicking a row reopens it prefilled --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  fill(c, "Pos", { date: "2026-02-10", note: "First draft" });
  save(c, "Pos");
  openForm(c, "Pos", rows(c.w, "Pos")[0]);
  ok(c.w.document.getElementById("lessonsPosForm").hidden === false, "reopens");
  ok(c.w.document.getElementById("lessonsPosDate").value === "2026-02-10", "date prefilled");
  ok(c.w.document.getElementById("lessonsPosNote").value === "First draft", "note prefilled");
  fill(c, "Pos", { note: "First draft, fixed a typo" });
  save(c, "Pos");
  ok(rows(c.w, "Pos").length === 1, "still one row -- edited in place, not duplicated");
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-text").textContent === "First draft, fixed a typo",
     "the edit landed");
  ok(stored(c).positive.length === 1, "and only one entry in storage too");
}

console.log("\n-- removable --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos"); fill(c, "Pos", { note: "Keep" }); save(c, "Pos");
  openForm(c, "Pos"); fill(c, "Pos", { note: "Delete me" }); save(c, "Pos");
  ok(rows(c.w, "Pos").length === 2, "two entries");
  const toDelete = rows(c.w, "Pos").find(r => r.querySelector(".lessonrow-text").textContent === "Delete me");
  click(c.w, toDelete.querySelector(".lessonrow-del"));
  ok(rows(c.w, "Pos").length === 1, "one left");
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-text").textContent === "Keep", "the right one");
  ok(stored(c).positive.length === 1, "and it is gone from storage too");
}

console.log("\n-- cumulative: unaffected by which day the daily view is on --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos"); fill(c, "Pos", { date: "2020-06-01", note: "An old lesson" }); save(c, "Pos");
  click(c.w, c.w.document.getElementById("backFromLessons"));
  click(c.w, c.w.document.getElementById("prev"));   // yesterday on the daily view
  openView(c);
  ok(rows(c.w, "Pos").length === 1 && rows(c.w, "Pos")[0].querySelector(".lessonrow-text").textContent === "An old lesson",
     "the same entry, regardless of which day is showing");
}

console.log("\n-- newest date first --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos"); fill(c, "Pos", { date: "2026-01-01", note: "Earliest" }); save(c, "Pos");
  openForm(c, "Pos"); fill(c, "Pos", { date: "2026-03-01", note: "Latest" }); save(c, "Pos");
  openForm(c, "Pos"); fill(c, "Pos", { date: "2026-02-01", note: "Middle" }); save(c, "Pos");
  const texts = rows(c.w, "Pos").map(r => r.querySelector(".lessonrow-text").textContent);
  ok(texts.join(",") === "Latest,Middle,Earliest", "sorted newest first: " + texts.join(","));
}

console.log("\n-- Cancel discards, doesn't save --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  fill(c, "Pos", { note: "Never mind" });
  click(c.w, c.w.document.getElementById("lessonsPosCancel"));
  ok(c.w.document.getElementById("lessonsPosForm").hidden === true, "form closes");
  ok(rows(c.w, "Pos").length === 0, "nothing was saved");
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
