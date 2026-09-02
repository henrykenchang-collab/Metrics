/* Guardrails folds like a panel, but it rebuilds its own markup on every
   render, so the state has to survive that -- guards the head in both the
   flagged and all-clear states, the toggle, that it is remembered, and that
   it still reads its alerts when shut. */
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
const guard = w => w.document.getElementById("guard");
const gHead = w => guard(w).querySelector(".guard-head");
const gBody = w => guard(w).querySelector(".guard-body");
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

// a week high against the week before it trips the heart-rate guardrail
const flagged = {};
for (let i = 0; i < 7; i++) flagged[shift(TODAY, -i)] = { avgHr: 78, vitamins: true, _t: 1 };
for (let i = 7; i < 14; i++) flagged[shift(TODAY, -i)] = { avgHr: 60, vitamins: true, _t: 1 };

console.log("\n-- a head in both states, so the control never moves --");
let c = open({});
ok(!!gHead(c.w), "all-clear still gets a head");
ok(/No Flags/.test(gHead(c.w).textContent), "which counts nothing: " + gHead(c.w).textContent.trim());
ok(!!gBody(c.w).querySelector(".guard-clear"), "and the all-clear line moved into the body");

let f = open({ "dailyReadout.v1": JSON.stringify(flagged) });
ok(/Flag/.test(gHead(f.w).textContent), "with something wrong it counts flags: " + gHead(f.w).textContent.trim());
ok(gBody(f.w).querySelectorAll(".alert-row").length > 0, "and the alerts sit in the body");

console.log("\n-- it folds --");
ok(!!gHead(f.w).querySelector(".chev"), "the head carries a chevron");
ok(gHead(f.w).getAttribute("role") === "button", "and announces as a button");
ok(gBody(f.w).hidden === false, "open to begin with");
click(f.w, gHead(f.w));
ok(gBody(f.w).hidden === true, "a click shuts it");
ok(gHead(f.w).classList.contains("shut"), "the head marks itself shut");
ok(gHead(f.w).getAttribute("aria-expanded") === "false", "and says so");
click(f.w, gHead(f.w));
ok(gBody(f.w).hidden === false, "clicking again opens it");

console.log("\n-- the keyboard --");
gHead(f.w).dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
ok(gBody(f.w).hidden === true, "Enter folds");
gHead(f.w).dispatchEvent(new f.w.KeyboardEvent("keydown", { key: " ", bubbles: true }));
ok(gBody(f.w).hidden === false, "Space unfolds");

console.log("\n-- remembered, and it survives a re-render --");
click(f.w, gHead(f.w));
ok(JSON.parse(f.jar["dailyReadout.shut"]).indexOf("guard") >= 0, "the choice is stored beside the panels'");
ok(!f.jar["dailyReadout.v1"] || !/"guard"/.test(f.jar["dailyReadout.v1"]), "and never into the log");
// paging the day re-runs renderGuard, which replaces the whole section
click(f.w, f.w.document.getElementById("prev"));
ok(gBody(f.w).hidden === true, "still shut after the guard rebuilt its own markup");
const back = open(f.jar);
ok(gBody(back.w).hidden === true, "and shut again on the next load");

console.log("\n-- shut hides it, it does not silence it --");
ok(/Average Resting Heart Rate/.test(guard(back.w).textContent),
   "the alert is still there to be read once opened");
ok(!/NaN/.test(guard(back.w).innerHTML), "no NaN");

console.log("\n-- condensed, to take up less room --");
ok(/\.guard-head \{[^}]*padding: 8px 16px 7px/.test(HTML), "the head's padding is tightened");
ok(/\.alert-row \{[^}]*padding: 7px 16px/.test(HTML), "so is each alert row's");
ok(/\.alert-name \{[^}]*font-size: 13px/.test(HTML), "and the alert name shrunk a point");

console.log("\n-- the panels are untouched by it --");
const shutList = JSON.parse(back.jar["dailyReadout.shut"]);
ok(shutList.indexOf("guard") >= 0 && shutList.indexOf("vitaminSupply") >= 0,
   "guard and vitaminSupply share the one store: " + shutList.join(", "));

console.log("\n-- Sauna is not yet a settled habit, so a miss stays quiet --");
{
  // pinned well after Sauna's own `since` (2026-08-17), so 30 days of
  // history land entirely inside its window rather than before it existed --
  // and on a day Sauna is actually due (Sun/Mon/Tue), so its own row still
  // shows a streak rather than reading Not Due
  const NOW = "2026-10-05T12:00:00";
  function openPinned(jar) { jar = jar || {};
    const w = new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>" + HTML + "</body></html>",
     { runScripts: "dangerously", pretendToBeVisual: true, url: "https://a.test/",
       beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null;
        const R = w.Date;
        function F(...a) { return a.length ? new R(...a) : new R(NOW); }
        F.prototype = R.prototype; F.now = () => new R(NOW).getTime(); F.parse = R.parse; F.UTC = R.UTC; w.Date = F;
        for (const [n, st] of [["localStorage", jar], ["sessionStorage", {}]])
         Object.defineProperty(w, n, { value: { getItem: k => (k in st ? st[k] : null),
          setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, configurable: true }); } }).window;
    return { w, jar };
  }
  const today = "2026-10-05";
  // every day logged (via vitamins), Sauna and Greens both due repeatedly
  // and never done -- the same shape of lapse for each, on purpose
  const seed = {};
  for (let i = 0; i < 30; i++) seed[shift(today, -i)] = { vitamins: true, ePre: 4, _t: 1 };
  const g = openPinned({ "dailyReadout.v1": JSON.stringify(seed) });
  const text = guard(g.w).textContent;
  ok(!/Sauna/.test(text), "Sauna's own lapse never appears in Guardrails: " + text.slice(0, 160));
  ok(/Lapsed/.test(text), "while an equally lapsed marker without the flag still trips it");
  const sauRow = [...g.w.document.getElementById("rows").querySelectorAll(".row")]
    .find(b => b.querySelector(".row-code").textContent === "SAU");
  ok(/^\D+\d+d$/.test(sauRow.querySelector(".streak").textContent),
     "though the row itself still shows the miss, just not in Guardrails: " + sauRow.querySelector(".streak").textContent);
}

console.log(fail ? "\n" + fail + " FAILED" : "\nall passed");
process.exit(fail ? 1 : 0);
