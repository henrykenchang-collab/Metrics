/* A seed built into the page must survive the trip back out: build.py embeds
   it, the page reads it on load, and every field has to arrive intact and
   render. This used to run against a scratch publish.html captured by hand,
   which went stale the moment real data or a default tag changed. It now
   builds its own page from a committed fixture, so it tests the mechanism
   rather than a snapshot of one afternoon's log. */
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

let fail = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };

const REPO = "/home/user/Metrics";
const SEED = path.join(REPO, "test/fixtures/seed.json");
const OUT = path.join(os.tmpdir(), "daily-readout-merge-test.html");
const fixture = JSON.parse(fs.readFileSync(SEED, "utf8"));
const DAY = "2026-01-14";                       // the fully-populated fixture day

execFileSync("python3", ["build.py", "--seed", SEED, "-o", OUT], { cwd: REPO });
const HTML = fs.readFileSync(OUT, "utf8");

const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const TODAY = iso(new Date());
const jar = {};
const sess = { "dailyReadout.cur": JSON.stringify({ d: DAY, on: TODAY }) };
const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
  { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null;
      for (const [n, st] of [["localStorage", jar], ["sessionStorage", sess]])
        Object.defineProperty(w, n, { value: {
          getItem: k => (k in st ? st[k] : null),
          setItem: (k, v) => { st[k] = String(v); },
          removeItem: k => { delete st[k]; },
        }, configurable: true });
    } }).window;

setTimeout(() => {
  console.log("\n-- the seed survives the build --");
  const saved = JSON.parse(jar["dailyReadout.v1"] || "{}");
  ok(Object.keys(saved).length === Object.keys(fixture.days).length,
     "every seeded day is held locally on load: " + Object.keys(saved).length);
  const d = saved[DAY];
  ok(!!d, "the populated day is there");
  ok(d && d.vitamins === true && d.keto === true, "markers intact");
  ok(d && d.bed === "21:30" && d.wake === "05:00", "sleep times intact");
  ok(d && d.sleep === 72 && d.cpap === 64 && d.hrv === 41 && d.hr === 55, "biometrics intact");
  ok(d && d.ePre === 4 && d.eAM === 3.5 && d.work === 3.5, "ratings intact, half-points included");
  ok(d && d.ePreNote === "slept through the alarm", "a rating note intact");
  ok(d && d.mood === "avg" && d.fluency === "good", "choices intact");
  ok(d && d.extraIr === 10 && d.extraXr === -20, "doses intact, negative included");
  ok(d && d.refill === "2026-01-14", "refill date intact");
  ok(d && (d.meals || []).length === 2 && d.meals[1].t === "salmon & greens", "meals intact");
  ok(d && (d.tags || []).indexOf("Test Factor") >= 0, "the day's tags intact");
  ok(saved["2026-01-15"] && saved["2026-01-15"].work === "na", "an N/A day keeps its N/A");

  console.log("\n-- and renders --");
  ok(w.document.getElementById("changed").value.indexOf("New pen") === 0, "the journal shows in the textarea");
  const tags = [...w.document.getElementById("taglist").children].map(b => b.textContent);
  ok(tags.indexOf("Test Factor") >= 0, "a seeded custom tag is offered as a button");
  ok(w.document.querySelectorAll("#meals .mealrow").length === 2, "both meals rendered");
  ok(w.document.getElementById("bed").value === "21:30", "the bed time is in its field");
  ok(w.document.getElementById("packHead").textContent.indexOf("Refilled") === 0,
     "the supply panel read the refill: " + w.document.getElementById("packHead").textContent);
  ok(w.document.getElementById("supply").querySelectorAll(".doserow").length === 1, "its one date row rendered");
  ok(!/NaN/.test(w.document.getElementById("grid").innerHTML), "no NaN in the month grid");
  ok(!/NaN/.test(w.document.getElementById("chips").textContent), "nor in the summary chips");

  try { fs.unlinkSync(OUT); } catch (e) {}
  console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
  process.exit(fail ? 1 : 0);
}, 150);
