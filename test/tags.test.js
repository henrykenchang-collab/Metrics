/* The factor list has two tiers. BASE_TAGS are built into the page, so they
   are on every device without syncing and cannot be dropped by the orphan
   rule that prunes retired labels. Custom tags ride in the seed. This guards
   that split, and that the built-in set is the one we mean it to be. */
const fs = require("fs"), { JSDOM } = require("jsdom");
const HTML = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
// every button except the trailing "+ New Factor"
const tags = c => [...c.w.document.getElementById("taglist").children]
  .filter(b => !b.classList.contains("add")).map(b => b.textContent);
const store = c => JSON.parse(c.jar["dailyReadout.v1"] || "{}")[TODAY] || {};
const click = (c, label) => [...c.w.document.getElementById("taglist").children]
  .find(b => b.textContent === label).dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));

console.log("\n-- the two new factors --");
let c = open({});
ok(tags(c).indexOf("No XR/IR") >= 0, "No XR/IR is offered");
ok(tags(c).indexOf("Nap") >= 0, "Nap is offered");

console.log("\n-- LMNT is one of them --");
ok(tags(c).indexOf("LMNT") >= 0, "offered on a page that has never synced a custom tag");
click(c, "LMNT");
ok((store(c).tags || []).indexOf("LMNT") >= 0, "it records on the day: " + JSON.stringify(store(c).tags));
ok(!/LMNT/.test(c.jar["dailyReadout.tags"] || ""),
   "and never enters the custom store -- it is built in, so it cannot be orphaned away");
click(c, "LMNT");
ok((store(c).tags || []).indexOf("LMNT") < 0, "tapping again clears it");
// it is a factor Patterns can weigh, which is the point of adding it
{
  const seed = {};
  const shift = (k, n) => { const p = k.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
  for (let i = 0; i < 20; i++) {
    seed[shift(TODAY, -i)] = { ePre: i % 2 ? 4 : 2, vitamins: true, _t: 1,
                               tags: i % 2 ? ["LMNT"] : [] };
  }
  const p2 = open({ "dailyReadout.v1": JSON.stringify(seed) });
  const names = [...p2.w.document.querySelectorAll("#facts .fact-name")].map(e => e.textContent);
  ok(names.some(n => n.indexOf("LMNT") >= 0), "it shows up in Patterns: " + names.slice(0, 6).join(" | "));
}
// a promoted duplicate is pruned, the same as any other built-in
{
  const dup = open({ "dailyReadout.tags": JSON.stringify(["LMNT", "Weak"]),
                     "dailyReadout.v1": JSON.stringify({ "2026-08-01": { vitamins: true, tags: ["LMNT"], _t: 1 } }) });
  ok(tags(dup).filter(t => t === "LMNT").length === 1, "typed by hand before today, it still appears once");
  ok(JSON.parse(dup.jar["dailyReadout.tags"]).indexOf("LMNT") < 0, "the hand-added copy is dropped as redundant");
  ok(JSON.parse(dup.jar["dailyReadout.v1"])["2026-08-01"].tags.join(",") === "LMNT",
     "and the day that already carried it keeps it");
}

console.log("\n-- they are permanent, not custom --");
ok(!c.jar["dailyReadout.tags"] || JSON.parse(c.jar["dailyReadout.tags"]).indexOf("Nap") < 0,
   "Nap is not written into the custom-tag store");
ok(!/"tags":\[[^\]]*Nap/.test(c.jar["dailyReadout.v1"] || ""), "nor carried in the log's tag list");
// a device that has never synced still gets them, which is what built-in means
const fresh = open({});
ok(tags(fresh).indexOf("Nap") >= 0 && tags(fresh).indexOf("No XR/IR") >= 0,
   "a device with empty storage still offers both");

console.log("\n-- the built-in set, in order --");
const expected = ["Stress", "Poor Sleep", "Sick", "No Keto", "Late Caffeine (10AM)",
                  "Late Gum (12PM)", "Extra Sleep", "Nap", "Extra XR/IR", "No XR/IR", "LMNT"];
ok(tags(c).join(" | ") === expected.join(" | "), "reads: " + tags(c).join(" | "));
ok(tags(c).indexOf("No XR/IR") === tags(c).indexOf("Extra XR/IR") + 1,
   "No XR/IR sits beside the Extra it complements");

console.log("\n-- and they behave like any other factor --");
click(c, "Nap");
ok((store(c).tags || []).indexOf("Nap") >= 0, "tapping Nap records it on the day");
click(c, "No XR/IR");
ok((store(c).tags || []).join(",") === "Nap,No XR/IR", "both hold at once: " + (store(c).tags || []).join(","));
click(c, "Nap");
ok((store(c).tags || []).join(",") === "No XR/IR", "tapping again clears just that one");
click(c, "No XR/IR");
ok(store(c).tags === undefined, "clearing the last one drops the key, so the day can go empty again");

console.log("\n-- a retired label still cannot come back --");
c = open({ "dailyReadout.tags": JSON.stringify(["New TH", "Fruits", "Keeper"]) });
ok(tags(c).indexOf("New TH") < 0 && tags(c).indexOf("Fruits") < 0, "retired tags stay out");
ok(tags(c).indexOf("Keeper") >= 0, "an unrelated custom tag survives");
ok(tags(c).indexOf("Nap") >= 0, "and the built-ins are unaffected");

console.log("\n-- Magnesium (Vit) and Bike (30min), retired --");
c = open({ "dailyReadout.tags": JSON.stringify(["Magnesium (Vit)", "Bike (30min)", "Keeper"]) });
ok(tags(c).indexOf("Magnesium (Vit)") < 0 && tags(c).indexOf("Bike (30min)") < 0,
   "neither is offered for a new entry: " + tags(c).join(","));
ok(tags(c).indexOf("Keeper") >= 0, "an unrelated custom tag is untouched by it");
ok(JSON.parse(c.jar["dailyReadout.tags"]).indexOf("Magnesium (Vit)") < 0 &&
   JSON.parse(c.jar["dailyReadout.tags"]).indexOf("Bike (30min)") < 0,
   "and both are dropped from the synced picker list, not just hidden");
c = open({ "dailyReadout.v1": JSON.stringify({
  "2026-08-30": { vitamins: true, tags: ["Magnesium (Vit)"], _t: 1 },
  "2026-08-31": { vitamins: true, tags: ["Bike (30min)"], _t: 1 } }) });
const augThirty = JSON.parse(c.jar["dailyReadout.v1"])["2026-08-30"];
const augThirtyOne = JSON.parse(c.jar["dailyReadout.v1"])["2026-08-31"];
ok((augThirty.tags || []).indexOf("Magnesium (Vit)") >= 0, "a past day keeps Magnesium (Vit)");
ok((augThirtyOne.tags || []).indexOf("Bike (30min)") >= 0, "and a past day keeps Bike (30min)");

console.log("\n-- promoting a custom tag to built-in leaves no duplicate --");
// "Nap" was a hand-added tag before it became a BASE_TAG; the synced copy
// is now redundant and should be pruned, without touching any day's tags
c = open({ "dailyReadout.tags": JSON.stringify(["Nap", "Weak"]),
           "dailyReadout.v1": JSON.stringify({ "2026-08-01": { vitamins: true, tags: ["Nap", "Extra Sleep"], _t: 1 } }) });
ok(tags(c).filter(t => t === "Nap").length === 1, "Nap appears exactly once in the picker");
ok(JSON.parse(c.jar["dailyReadout.tags"]).indexOf("Nap") < 0, "and is dropped from the custom store as redundant");
ok(JSON.parse(c.jar["dailyReadout.tags"]).indexOf("Weak") >= 0, "a genuinely custom tag stays");
ok(JSON.parse(c.jar["dailyReadout.v1"])["2026-08-01"].tags.join(",") === "Nap,Extra Sleep",
   "and the day that carried it is untouched");

console.log("\n-- an old day keeps a tag it already carried --");
c = open({ "dailyReadout.v1": JSON.stringify({ "2026-01-05": { vitamins: true, tags: ["Fruits"], _t: 1 } }) });
const kept = JSON.parse(c.jar["dailyReadout.v1"])["2026-01-05"];
ok((kept.tags || []).indexOf("Fruits") >= 0, "history is never rewritten, even for a retired label");

console.log("\n-- Factors folds, and starts shut --");
{
  c = open({});
  const head = c.w.document.getElementById("factorsHead");
  const body = c.w.document.getElementById("factorsBody");
  ok(!!head && !!body, "the fold control and its body exist");
  ok(body.hidden === true, "shut on a log that has never been folded");
  ok(head.querySelector(".chev"), "it carries a chevron like any other fold");
  ok(head.getAttribute("aria-expanded") === "false", "and says so");
  head.dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
  ok(body.hidden === false, "clicking it opens the tags");
  ok(head.getAttribute("aria-expanded") === "true", "and says so");
  ok(c.w.document.getElementById("taglist").children.length > 0,
     "the tags were there all along, just hidden -- opening does not build them");
  head.dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
  ok(body.hidden === true, "clicking again shuts it");
  const stored = JSON.parse(c.jar["dailyReadout.shut"]);
  ok(stored.indexOf("factors") >= 0, "the choice is remembered like any other fold: " + stored.join(", "));
  ok(!c.jar["dailyReadout.v1"] || !/"factors"/.test(c.jar["dailyReadout.v1"]), "and never in the log");
  // the default is applied once; after that it is the user's own choice
  const again = open(c.jar);
  const bodyAgain = again.w.document.getElementById("factorsBody");
  again.w.document.getElementById("factorsHead").dispatchEvent(new again.w.MouseEvent("click", { bubbles: true }));
  ok(bodyAgain.hidden === false, "opening it works on a fresh load too");
}

console.log("\n-- the factor pills are small --");
ok(/\.tag \{[^}]*font-size: 11px/.test(HTML), "shrunk from the original 12.5px");

console.log("\n-- Factors' pills are shrunk further still, scoped to that panel alone --");
{
  const css = HTML.replace(/\s+/g, " ");
  const m = css.match(/#taglist \.tag \{([^}]*)\}/);
  ok(!!m, "a Factors-scoped override exists");
  ok(m && /font-size: [0-9.]+px/.test(m[1]) && parseFloat(m[1].match(/font-size: ([0-9.]+)px/)[1]) < 11,
     "smaller than the shared 11px baseline: " + (m && m[1]));
  const c = open({});
  const pill = c.w.document.getElementById("taglist").querySelector(".tag:not(.add)");
  ok(pill.className.split(" ").indexOf("tag") >= 0,
     "still just the shared .tag class -- the size comes from the #taglist scope, not a new class");
  // Lessons Learned tag-pick pills reuse the same base .tag class -- confirm
  // the override lives under #taglist and does not touch that markup
  ok(!/#lessons\w*TagPick \.tag \{[^}]*font-size/.test(css),
     "Lessons Learned's tag picker keeps its own size, untouched by the Factors override");
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
