const fs = require("fs");
const { JSDOM } = require("jsdom");

const BUILT = fs.readFileSync("/home/user/Metrics/daily-readout.html", "utf8");
let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const wrap = (b) => "<!doctype html><html><head><meta charset='utf-8'></head><body>" + b + "</body></html>";

// Open the page with a chosen localStorage jar and an optional artifact
// capability, both installed BEFORE the page's script runs.
function open(html, jar, withCap) {
  jar = jar || {};
  const box = { sent: null, calls: 0 };
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://artifact.test/",
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null;   // icon is a nicety
      const ls = {
        getItem: (k) => (k in jar ? jar[k] : null),
        setItem: (k, v) => { jar[k] = String(v); },
        removeItem: (k) => { delete jar[k]; },
      };
      Object.defineProperty(w, "localStorage", { value: ls, configurable: true });
      if (withCap) {
        w.claude = { use: (n) => Promise.resolve(n === "artifact" ? {
          publish: (arg) => { box.calls++; box.sent = arg; return Promise.resolve({ version: "v" + box.calls }); },
        } : null) };
      }
    },
  });
  return { w: dom.window, jar, box };
}

const row = (w, code) => [...w.document.getElementById("rows").children]
  .find((b) => b.querySelector(".row-code").textContent === code);
const tap = (w, code) => row(w, code).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const syncNow = (w) => w.document.getElementById("syncBtn")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const seedOf = (doc) => JSON.parse(doc.match(/id="seed">(.*?)<\/script>/s)[1].replace(/<\\\//g, "</"));
const strip = (h) => h.replace(/<script type="application\/json" id="seed">.*?<\/script>/s, "SEED");
const bodyOf = (doc) => strip(doc)
  .replace(/^<!doctype html><html><head>.*?<\/head><body>/s, "")
  .replace(/<\/body><\/html>$/, "").trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("\n-- render --");
  let a = open(wrap(BUILT), {}, false);
  ok(a.w.document.getElementById("rows").children.length === 12, "12 marker rows rendered");
  ok(/Sun–Tue/.test(a.w.document.getElementById("rows").textContent), 'sauna reads "Sun–Tue"');
  await wait(50);
  ok(a.w.document.getElementById("syncText").textContent === "This device only",
     "no capability -> says so plainly instead of claiming it synced");

  console.log("\n-- local writes --");
  let b = open(wrap(BUILT), {}, false);
  tap(b.w, "VIT");
  let saved = JSON.parse(b.jar["dailyReadout.v1"]);
  const today = Object.keys(saved)[0];
  ok(saved[today].vitamins === true, "tapping a marker records it locally");
  ok(typeof saved[today]._t === "number", "the day carries a write stamp");
  tap(b.w, "VIT");
  ok(Object.keys(JSON.parse(b.jar["dailyReadout.v1"])).length === 0,
     "untoggling the last marker drops the day, stamp and all");

  console.log("\n-- saving --");
  let c = open(wrap(BUILT), {}, true);
  await wait(50);
  ok(c.w.document.getElementById("syncText").textContent === "Synced", "clean load reports Synced");
  tap(c.w, "SAU");
  ok(c.w.document.getElementById("syncText").textContent === "Not saved yet", "an edit shows unsaved");
  syncNow(c.w);
  await wait(100);
  const sent = c.box.sent;
  ok(sent && typeof sent === "object" && sent["index.html"], "saves via the files form (no view reload)");
  const doc = sent["index.html"];
  ok(doc.startsWith("<!doctype html>"), "publishes a complete document, doctype first");
  ok(c.w.document.getElementById("syncText").textContent.startsWith("Synced"), "reports Synced after");

  console.log("\n-- the republished page --");
  ok(seedOf(doc).days[today].sauna === true, "the seed carries the logged day");
  const TITLE = "<title>Daily Readout</title>";
  ok(strip(BUILT).trim().startsWith(TITLE), "uploaded file carries the title up front (tool scans 8KB)");
  ok(doc.includes("<head>") && doc.indexOf(TITLE) < doc.indexOf("<body>"), "republished doc puts the title in <head>");
  ok(bodyOf(doc) === strip(BUILT).trim().slice(TITLE.length).trim(),
     "republished page == original page, only the seed and title position differ");

  console.log("\n-- a different device opens it --");
  const other = open(doc, {}, true);          // empty localStorage
  await wait(50);
  ok(row(other.w, "SAU").classList.contains("on"), "reads the log out of the published page");
  ok(JSON.parse(other.jar["dailyReadout.v1"] || "{}")[today].sauna === true,
     "writes its local copy on load, before any edit");
  ok(other.w.document.getElementById("syncText").textContent === "Synced", "reports Synced, nothing pending");
  ok(other.box.calls === 0, "does not publish on load");

  console.log("\n-- fixed point --");
  const d = open(doc, {}, true);
  await wait(50);
  tap(d.w, "GRN");
  syncNow(d.w);
  await wait(100);
  const doc2 = d.box.sent["index.html"];
  ok(strip(doc2) === strip(doc), "a second save reproduces the same page");
  const s2 = seedOf(doc2).days[today];
  ok(s2.sauna === true && s2.greens === true, "second save keeps the first save's data");

  console.log("\n-- merge: two devices, different days --");
  const older = { "dailyReadout.v1": JSON.stringify({ "2026-08-20": { keto: true, _t: 1 } }) };
  const m = open(doc, older, true);           // seed has today, local has the 20th
  await wait(50);
  const merged = JSON.parse(m.jar["dailyReadout.v1"] || "{}");
  ok(m.w.document.getElementById("syncText").textContent === "Not saved yet",
     "a local day the artifact lacks is flagged, not silently published");
  syncNow(m.w);
  await wait(100);
  const days = seedOf(m.box.sent["index.html"]).days;
  ok(days["2026-08-20"].keto === true && days[today].sauna === true,
     "both devices' days survive the merge");

  console.log("\n-- merge: same day, newest write wins --");
  const stale = { "dailyReadout.v1": JSON.stringify({ [today]: { sauna: false, run: true, _t: 1 } }) };
  const n2 = open(doc, stale, true);
  await wait(50);
  ok(!row(n2.w, "RUN").classList.contains("on") && row(n2.w, "SAU").classList.contains("on"),
     "the newer published day wins over a stale local one");

  console.log("\n-- offline --");
  const off = open(wrap(BUILT), {}, false);
  off.w.claude = { use: () => Promise.resolve(null) };
  tap(off.w, "KET");
  await wait(50);
  ok(JSON.parse(off.jar["dailyReadout.v1"])[today].keto === true, "edits still land with no capability");

  console.log(fail ? "\n" + fail + " FAILED" : "\nall " + "passed");
  process.exit(fail ? 1 : 0);
})();
