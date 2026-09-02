/* The vitamin reference sheet under Vitamins: a fold labeled "Vitamin
   Details" that opens directly onto a card per vitamin (Magnesium, ADK, D,
   B1, B12, Theanine, Ashwagandha) with Start Date, Dosage, Brand and an
   optional Note. One fold, not two -- an earlier version nested a
   "Vitamin Details" link inside a separately-folding "Doses" header, which
   was redundant; the head itself now reads "Vitamin Details" and opening it
   is opening the cards, nothing in between. Unlike the old daily checklist
   this replaced, it is settings, not a log entry -- no day it belongs to,
   no streak, no month-grid row, no guardrail trend, no Patterns factor, no
   export column. This guards the form itself, that it stays untracked
   elsewhere, and that it rides along in the sync/seed pipeline the way the
   day log and custom tags already do. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = iso(new Date());

function open(jar) { jar = jar || {};
  const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
   { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
     beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
       Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
        setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
  return { w, jar };
}
const card = (w, label) => [...w.document.querySelectorAll(".vit-card")]
  .find(c => c.querySelector(".vit-card-name").textContent === label);
const field = (w, label, f) => card(w, label).querySelector('.vitin[data-f="' + f + '"]');
const change = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const openHead = w => click(w, w.document.getElementById("vitDosesHead"));
const vitInfo = c => JSON.parse(c.jar["dailyReadout.vitInfo"] || "{}");
const day = (c, k) => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[k] || {};

console.log("\n-- it sits directly under Vitamins --");
let c = open({});
const rows = [...c.w.document.getElementById("rows").children];
const iVit = rows.findIndex(el => el.querySelector && el.querySelector(".row-code") && el.querySelector(".row-code").textContent === "VIT");
const iVitwrap = rows.findIndex(el => el.id === "vitDosesHead" || (el.querySelector && el.querySelector("#vitDosesHead")));
ok(iVit === 0, "Vitamins is the first row: index " + iVit);
ok(iVitwrap === iVit + 1, "the reference sheet is the very next thing: index " + iVitwrap);
ok(!c.w.document.getElementById("vitDosesHead").closest(".row"),
   "it is its own block, not inside the Vitamins row itself");

console.log("\n-- one fold, reading Vitamin Details, no nested link --");
{
  const head = c.w.document.getElementById("vitDosesHead");
  const body = c.w.document.getElementById("vitDosesBody");
  ok(head.querySelector(".code").textContent === "Vitamin Details",
     "the head itself reads Vitamin Details: " + JSON.stringify(head.querySelector(".code").textContent));
  ok(head.getAttribute("aria-label") === "Vitamin Details", "and says so for a screen reader too");
  ok(!c.w.document.getElementById("vitDetailsLink"), "the old nested link is gone");
  ok(!c.w.document.querySelector(".vit-link"), "and so is its class");
  ok(body.hidden === true, "shut on a log that has never been folded");
  ok(head.querySelector(".chev"), "carries a chevron like every other fold");
  ok(head.getAttribute("role") === "button", "announces as a button");
  click(c.w, head);
  ok(body.hidden === false, "one click opens it -- straight onto the cards");
  ok(c.w.document.querySelectorAll("#vitDosesBody .vit-card").length === 7,
     "all seven cards are right there, nothing further to open");
  click(c.w, head);
  ok(body.hidden === true, "and shuts again");
}

console.log("\n-- no tags left either --");
c = open({});
ok(!c.w.document.querySelector(".dose-pill"), "the old toggle pills are gone");

console.log("\n-- all seven vitamins, each with four fields --");
c = open({});
openHead(c.w);
const names = ["Magnesium", "ADK", "D", "B1", "B12", "Theanine", "Ashwagandha"];
ok(names.every(n => !!card(c.w, n)), "all seven get a card: " + names.filter(n => !card(c.w, n)).join(","));
const one = card(c.w, "Magnesium");
ok(one.querySelector('.vitin[data-f="start"]').type === "date", "Start Date is a date field");
ok(one.querySelector('.vitin[data-f="dose"]').type === "text", "Dosage is free text");
ok(one.querySelector('.vitin[data-f="brand"]').type === "text", "Brand is free text");
ok(one.querySelector('.vitin[data-f="note"]').type === "text", "Note is free text");
ok(one.querySelector('.vitin[data-f="note"]').placeholder === "optional", "and marked optional");
ok(names.every(n => ["start", "dose", "brand", "note"].every(f => field(c.w, n, f).value === "")),
   "nothing filled in yet");

console.log("\n-- filling in a field records it, keyed by vitamin --");
c = open({});
openHead(c.w);
change(c.w, field(c.w, "Magnesium", "start"), "2026-06-01");
change(c.w, field(c.w, "Magnesium", "dose"), "200mg");
change(c.w, field(c.w, "Magnesium", "brand"), "Now Foods");
change(c.w, field(c.w, "Magnesium", "note"), "Take with dinner");
const stored = vitInfo(c);
ok(stored.vitMag.start === "2026-06-01" && stored.vitMag.dose === "200mg" &&
   stored.vitMag.brand === "Now Foods" && stored.vitMag.note === "Take with dinner",
   "all four land under vitMag: " + JSON.stringify(stored.vitMag));
ok(typeof stored.vitMag._t === "number", "carries its own write stamp");
ok(!("vitADK" in stored), "an untouched vitamin stays absent entirely");

console.log("\n-- and the note is genuinely optional --");
c = open({});
openHead(c.w);
change(c.w, field(c.w, "D", "dose"), "5000IU");
ok(vitInfo(c).vitD.dose === "5000IU" && !("note" in vitInfo(c).vitD),
   "a dosage with no note is still saved, note simply absent");

console.log("\n-- clearing every field drops the entry --");
c = open({ "dailyReadout.vitInfo": JSON.stringify({ vitB1: { dose: "100mg", _t: 1 } }) });
openHead(c.w);
ok(field(c.w, "B1", "dose").value === "100mg", "the saved dose comes back into the field");
change(c.w, field(c.w, "B1", "dose"), "");
ok(!("vitB1" in vitInfo(c)), "clearing the only field removes the vitamin from storage entirely");

console.log("\n-- it survives a reload, same device --");
c = open({});
openHead(c.w);
change(c.w, field(c.w, "B12", "brand"), "Nature Made");
const again = open(c.jar);
openHead(again.w);
ok(field(again.w, "B12", "brand").value === "Nature Made", "the brand is still there next load");

console.log("\n-- it rides in the seed, alongside days and tags --");
{
  const seedHTML = '<script type="application/json" id="seed">' +
    JSON.stringify({ v: 1, days: {}, tags: [], vitInfo: { vitTheanine: { dose: "400mg", brand: "Suntheanine", _t: 5 } } }) +
    "</script>" + HTML;
  const w2 = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + seedHTML + "</body></html>",
    { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
      beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
       const jar = {};
       for (const n of ["localStorage", "sessionStorage"])
        Object.defineProperty(w, n, { value: { getItem: k => (k in jar ? jar[k] : null),
         setItem: (k, v) => { jar[k] = String(v); }, removeItem: k => { delete jar[k]; } }, configurable: true }); } }).window;
  openHead(w2);
  ok(field(w2, "Theanine", "dose").value === "400mg" && field(w2, "Theanine", "brand").value === "Suntheanine",
     "a vitamin seeded from a published copy reads back into its card");
}

console.log("\n-- filling in a field never touches the Vitamins marker or today's log --");
c = open({});
openHead(c.w);
change(c.w, field(c.w, "Ashwagandha", "dose"), "600mg");
ok(day(c, TODAY).vitamins === undefined, "the Vitamins row itself is untouched");
ok(Object.keys(day(c, TODAY)).length === 0, "and nothing lands in today's day record at all");

console.log("\n-- none of it is tracked anywhere else --");
{
  const jar = { "dailyReadout.vitInfo": JSON.stringify({
    vitMag: { start: "2026-01-01", dose: "200mg", brand: "Now Foods", note: "test", _t: 1 },
    vitADK: { dose: "1 cap", _t: 1 }, vitD: { dose: "5000IU", _t: 1 }, vitB1: { dose: "100mg", _t: 1 },
    vitB12: { dose: "1000mcg", _t: 1 }, vitTheanine: { dose: "400mg", _t: 1 }, vitAshwagandha: { dose: "600mg", _t: 1 }
  }) };
  const seed = {};
  for (let i = 0; i < 30; i++) seed[shift(TODAY, -i)] = { vitamins: true, ePre: 4, _t: 1 };
  jar["dailyReadout.v1"] = JSON.stringify(seed);
  const w2 = open(jar).w;
  const vitRow = [...w2.document.getElementById("rows").querySelectorAll(".row")]
    .find(b => b.querySelector(".row-code").textContent === "VIT");
  ok(vitRow.querySelector(".streak").textContent.endsWith("d") &&
     !vitRow.querySelector(".streak").textContent.startsWith("-"),
     "the Vitamins streak is unaffected by a full reference sheet: " + vitRow.querySelector(".streak").textContent);
  ok(!/Magnesium|Now Foods|Suntheanine/.test(w2.document.getElementById("guard").textContent),
     "no guardrail mentions a vitamin's details");
  const gridLabels = [...w2.document.getElementById("grid").querySelectorAll(".grid-label")].map(e => e.textContent);
  ok(!gridLabels.some(l => /MAG|ADK|THE|ASH/.test(l)), "no month-grid row for any vitamin: " + gridLabels.join(","));
  const factorNames = [...w2.document.getElementById("outcome").children].map(b => b.textContent)
    .concat([...w2.document.querySelectorAll("#facts .fact-name")].map(e => e.textContent));
  ok(!names.some(n => factorNames.indexOf(n) >= 0), "not a Patterns outcome or factor either");
}

console.log("\n-- and the export never mentions them --");
{
  let copied = "";
  c = open({ "dailyReadout.vitInfo": JSON.stringify({ vitB12: { dose: "1000mcg", brand: "Nature Made", _t: 1 } }) });
  Object.defineProperty(c.w.navigator, "clipboard", { value: { writeText: t => { copied = t; return Promise.resolve(); } }, configurable: true });
  c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
  setTimeout(() => {
    const head = copied.split("\n")[0];
    ok(!/Magnesium|Nature Made|1000mcg|Dosage|Brand/.test(head), "no vitamin-detail column in the export header: " + head.slice(0, 160));
    console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
    process.exit(fail ? 1 : 0);
  }, 150);
}
