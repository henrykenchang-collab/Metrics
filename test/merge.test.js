const fs = require("fs"); const { JSDOM } = require("jsdom");
const F = "/tmp/claude-0/-home-user-Metrics/80007829-a004-5ea5-bf37-88f25f92eb5c/scratchpad/publish.html";
const HTML = fs.readFileSync(F, "utf8");
let fail = 0; const ok = (c,m) => { console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c) fail++; };
const jar = {};
const dom = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
  { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null;
      Object.defineProperty(w, "localStorage", { value: {
        getItem: k => (k in jar ? jar[k] : null), setItem: (k,v) => { jar[k] = String(v); }, removeItem: k => { delete jar[k]; },
      }, configurable: true });
    }});
const w = dom.window;
setTimeout(() => {
  const saved = JSON.parse(jar["dailyReadout.v1"] || "{}");
  const d = saved["2026-08-27"];
  ok(!!d, "today's entry survived the rebuild");
  ok(d && d.th === true && d.vitamins === true && d.read === true && d.yt === true, "markers intact");
  ok(d && d.bed === "21:00" && d.wake === "05:15", "sleep times intact");
  ok(d && d.ePre === 4 && d.eAM === 3 && d.mood === "avg", "ratings intact");
  ok(d && d.extraIr === 10, "Extra IR intact");
  ok(d && /New TH pen/.test(d.changed || ""), "journal note intact");
  ok(d && (d.tags||[]).indexOf("New TH") === 0, "day's tag intact");
  const tags = [...w.document.getElementById("taglist").children].map(b => b.textContent);
  ok(tags.indexOf("New TH") >= 0, "custom tag still offered as a button");
  ok(w.document.getElementById("changed").value.indexOf("New TH pen") === 0, "journal shows in the textarea");
  // and the new feature is present and quiet
  ok(w.document.getElementById("packHead").textContent === "No Pack", "supply panel present, no pack yet");
  ok(w.document.getElementById("supply").children.length === 2, "the two IR fields rendered");
  console.log(fail ? "\n"+fail+" FAILED" : "\nall passed");
  process.exit(fail?1:0);
}, 120);
