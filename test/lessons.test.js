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
const fill = (c, p, { title, date, note } = {}) => {
  if (title !== undefined) input(c.w, c.w.document.getElementById("lessons" + p + "Title"), title);
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
  // the rule may list further views alongside these two, so match any rule
  // whose selector list carries the id rather than pinning the exact pair
  const css = HTML.replace(/\s+/g, " ");
  const hiddenRule = id => new RegExp("(^|\\}|,)[^{}]*#" + id + "\\[hidden\\][^{}]*\\{[^}]*display: none").test(css);
  ok(hiddenRule("chartsView") && hiddenRule("lessonsView"), "both carry an explicit [hidden] rule");
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
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-tags").children.length === 0,
     "tag column is empty, not a stray chip");
}

console.log("\n-- tags: typed once, offered on both, and now several can be picked per entry --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Good Sleep");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  ok(c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.on").textContent === "Good Sleep",
     "typing a new tag picks it immediately");
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Diet");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  const onTags = () => [...c.w.document.getElementById("lessonsPosTagPick").querySelectorAll(".tag.on")].map(b => b.textContent);
  ok(onTags().join(",") === "Good Sleep,Diet", "adding a second tag keeps the first picked too: " + onTags().join(","));
  fill(c, "Pos", { note: "Great night" });
  save(c, "Pos");
  const chips = [...rows(c.w, "Pos")[0].querySelectorAll(".lessonrow-tag")].map(e => e.textContent);
  ok(chips.join(",") === "Good Sleep,Diet", "both land on the row as separate chips: " + chips.join(","));
  ok(stored(c).positive[0].tags.join(",") === "Good Sleep,Diet", "and both persist on the entry");

  openForm(c, "Neg");
  const negTags = [...c.w.document.getElementById("lessonsNegTagPick").children].map(b => b.textContent);
  ok(negTags.indexOf("Good Sleep") >= 0 && negTags.indexOf("Diet") >= 0,
     "both offered on the Negative form too -- one shared, growing vocabulary: " + negTags.join(","));
  const negBtn = [...c.w.document.getElementById("lessonsNegTagPick").children].find(b => b.textContent === "Good Sleep");
  click(c.w, negBtn);
  fill(c, "Neg", { note: "Poor night" });
  save(c, "Neg");
  ok(rows(c.w, "Neg")[0].querySelector(".lessonrow-tag").textContent === "Good Sleep",
     "picking it on the Negative side records it there too, independently");
  ok([...rows(c.w, "Pos")[0].querySelectorAll(".lessonrow-tag")].map(e => e.textContent).join(",") === "Good Sleep,Diet",
     "without disturbing the Positive entry");

  const jar2 = JSON.parse(c.jar["dailyReadout.lessonTags"] || "[]");
  ok(jar2.indexOf("Good Sleep") >= 0 && jar2.indexOf("Diet") >= 0, "and the vocabulary itself is stored, ready for next time");
}

console.log("\n-- tapping a picked tag again drops just that one --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Diet");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Exercise");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  const pick = t => [...c.w.document.getElementById("lessonsPosTagPick").children].find(b => b.textContent === t);
  ok(pick("Diet").classList.contains("on") && pick("Exercise").classList.contains("on"), "both picked after adding");
  click(c.w, pick("Diet"));
  ok(!pick("Diet").classList.contains("on"), "tapping Diet again drops it");
  ok(pick("Exercise").classList.contains("on"), "Exercise stays picked");
}

console.log("\n-- editing an entry prefills every tag it carries, not just one --");
{
  const c = open({});
  openView(c);
  openForm(c, "Pos");
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Sleep");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  click(c.w, c.w.document.getElementById("lessonsPosTagPick").querySelector(".tag.add"));
  input(c.w, c.w.document.getElementById("lessonsPosTagInput"), "Mood");
  click(c.w, c.w.document.getElementById("lessonsPosTagSave"));
  fill(c, "Pos", { note: "Two tags" });
  save(c, "Pos");
  openForm(c, "Pos", rows(c.w, "Pos")[0]);
  const onTags = [...c.w.document.getElementById("lessonsPosTagPick").querySelectorAll(".tag.on")].map(b => b.textContent);
  ok(onTags.join(",") === "Sleep,Mood", "reopening the entry re-picks both tags: " + onTags.join(","));
}

console.log("\n-- an entry saved under the old single-tag shape still reads, migrated on open --");
{
  const legacy = { positive: [{ id: "legacy1", date: "2026-01-01", tag: "Old Tag", text: "From before multi-select", _t: 1 }], negative: [] };
  const c = open({ "dailyReadout.lessons": JSON.stringify(legacy) });
  openView(c);
  const chips = [...rows(c.w, "Pos")[0].querySelectorAll(".lessonrow-tag")].map(e => e.textContent);
  ok(chips.join(",") === "Old Tag", "the old single tag shows as its one chip: " + chips.join(","));
  ok(stored(c).positive[0].tags && stored(c).positive[0].tags.join(",") === "Old Tag" && stored(c).positive[0].tag === undefined,
     "and is rewritten to the tags array shape on save");
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

console.log("\n-- each entry can carry a title --");
{
  const c = open({}); openView(c);
  const form = p => c.w.document.getElementById("lessons" + p + "Form");
  openForm(c, "Pos");
  ok(!!c.w.document.getElementById("lessonsPosTitle"), "the Positive form has a Title field");
  ok(!!c.w.document.getElementById("lessonsNegTitle"), "so does the Negative one");
  ok([...form("Pos").querySelectorAll(".lessonfield > .code")].map(e => e.textContent)[0] === "Title",
     "and it is the first field, above the date");
  ok(c.w.document.activeElement === c.w.document.getElementById("lessonsPosTitle"),
     "opening the form lands in it, not partway down");

  fill(c, "Pos", { title: "Morning walk", date: "2026-03-04", note: "Cleared the head before standup." });
  save(c, "Pos");
  const row = rows(c.w, "Pos")[0];
  ok(row.querySelector(".lessonrow-title").textContent === "Morning walk", "the title heads the row");
  ok(row.querySelector(".lessonrow-text").textContent === "Cleared the head before standup.",
     "with the note underneath it");
  ok(stored(c).positive[0].title === "Morning walk", "and it is stored on the entry");

  // reopening prefills it, and clearing it puts the row back to note-only
  openForm(c, "Pos", rows(c.w, "Pos")[0]);
  ok(c.w.document.getElementById("lessonsPosTitle").value === "Morning walk", "reopens prefilled");
  fill(c, "Pos", { title: "  " });
  save(c, "Pos");
  ok(!rows(c.w, "Pos")[0].querySelector(".lessonrow-title"),
     "blanking it drops the title line rather than leaving an empty one");
  ok(stored(c).positive[0].title === "", "stored blank, not left at the old value");
  ok(rows(c.w, "Pos")[0].querySelector(".lessonrow-text").textContent === "Cleared the head before standup.",
     "and the note is still there");
}

console.log("\n-- a title alone is not an entry --");
{
  const c = open({}); openView(c);
  openForm(c, "Pos");
  fill(c, "Pos", { title: "Just a heading", note: "" });
  save(c, "Pos");
  ok(rows(c.w, "Pos").length === 0, "the note stays the required field");
}

console.log("\n-- an entry written before titles existed still reads --");
{
  const c = open({ "dailyReadout.lessons": JSON.stringify({
    positive: [{ id: "old1", date: "2026-01-02", tags: ["Sleep"], text: "No title on this one.", _t: 1 }],
    negative: [] }) });
  openView(c);
  const row = rows(c.w, "Pos")[0];
  ok(!row.querySelector(".lessonrow-title"), "no title line invented for it");
  ok(row.querySelector(".lessonrow-text").textContent === "No title on this one.", "and the note reads as before");
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
