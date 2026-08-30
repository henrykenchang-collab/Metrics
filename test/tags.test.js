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
                  "Late Gum (12PM)", "Extra Sleep", "Nap", "Extra XR/IR", "No XR/IR"];
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

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
