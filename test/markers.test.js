const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const TODAY=iso(new Date());
function open(jar,sess){jar=jar||{};sess=sess||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     for(const[n,st]of[["localStorage",jar],["sessionStorage",sess]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
// pins the clock itself, for a day after `since` that isn't today (which the
// app otherwise refuses to view, since it never lets you page past today)
function openFake(fakeToday){
  const sess={"dailyReadout.cur":JSON.stringify({d:fakeToday,on:fakeToday})};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     const Real=w.Date, fixed=fakeToday+"T12:00:00";
     function Fake(...a){ return a.length ? new Real(...a) : new Real(fixed); }
     Fake.prototype=Real.prototype; Fake.now=()=>new Real(fixed).getTime();
     Fake.parse=Real.parse; Fake.UTC=Real.UTC; w.Date=Fake;
     for(const[n,st]of[["localStorage",{}],["sessionStorage",sess]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w};
}
// markers render into Daily Markers or, when grouped, into their own panel
const rowFor=(w,c)=>[...w.document.querySelectorAll("#rows > .row, #petrows > .row")]
  .find(b=>b.querySelector(".row-code").textContent===c);
const title=(w,c)=>rowFor(w,c).querySelector(".row-name").textContent.trim();
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};

console.log("\n-- Gym --");
let c=open({});
ok(!!rowFor(c.w,"GYM"),"a GYM row exists");
ok(title(c.w,"GYM")==="Gym: Sun · Mon · Thu · Fri","reads: "+JSON.stringify(title(c.w,"GYM")));
ok(c.w.document.querySelectorAll("#rows > .row, #petrows > .row").length===15,"fifteen markers now, across two panels");
ok(c.w.document.getElementById("petrows").children.length===3,"three of them in Shanti and Buddha");
rowFor(c.w,"GYM").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).gym===true,"it records");
const labels=[...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e=>e.textContent);
ok(labels.includes("GYM"),"and has its own row in the month grid");

console.log("\n-- schedules ride on the name --");
ok(title(c.w,"SAU")==="Sauna: Sun–Tue","Sauna: Sun–Tue");
ok(title(c.w,"GRN")==="Greens: Sun · Mon · Wed","Greens: Sun · Mon · Wed");
ok(title(c.w,"CLD")==="Cold Plunge: Not Sat","Cold Plunge: Not Sat");
ok(!rowFor(c.w,"WGT"),"Weights is gone, folded into Gym");
ok(title(c.w,"VIT")==="Vitamins","a marker with no schedule keeps just its name");
ok(title(c.w,"KET")==="Keto","and so does Keto");
ok(title(c.w,"WLK")==="Walk with Shanti: PM · Not Sat","target and schedule combine");
ok(/^Read: 15 Min · Not Sat$|^Read: 30 Min · Not Sat$/.test(title(c.w,"RDG")),
   "Read carries its target too: "+title(c.w,"RDG"));
ok(rowFor(c.w,"SAU").querySelectorAll(".row-name > *").length===1,"one line, one nested span -- the start date moved out, next to the streak");

console.log("\n-- Artificial Daylight --");
ok(!!rowFor(c.w,"LGT"),"an LGT row exists");
ok(title(c.w,"LGT")==="Artificial Daylight: 30 Min","reads: "+JSON.stringify(title(c.w,"LGT")));
rowFor(c.w,"LGT").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).artLight===true,"it records");
const lgtLabels=[...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e=>e.textContent);
ok(lgtLabels.includes("LGT"),"and has its own row in the month grid");
// brand new today -- `since` must keep any earlier lapse from reading as one
const early=open({"dailyReadout.v1":JSON.stringify({"2026-06-01":{vitamins:true,_t:1}})});
ok(!/Artificial Daylight/.test(early.w.document.getElementById("guard").textContent),
   "no retroactive lapse from before it existed");

console.log("\n-- Shanti and Buddha --");
c=open({});
const heads=[...c.w.document.querySelectorAll("section.panel .panel-head .code:first-child")].map(e=>e.textContent);
ok(heads.indexOf("Shanti and Buddha")===heads.indexOf("Daily Markers")+1,
   "its panel sits right after Daily Markers: "+heads.join(" | "));
const pets=[...c.w.document.getElementById("petrows").children]
  .map(b=>b.querySelector(".row-name").textContent.trim());
ok(pets.join(" | ")==="Walk with Shanti: PM · Not Sat | Buddha Brush: Sun | Shanti Brush: Sun",
   "the three activities, weekly for the two brushes: "+pets.join(" | "));
ok(!c.w.document.getElementById("rows").textContent.match(/Shanti|Buddha/),
   "and none of them is left behind in Daily Markers");
// a grouped marker is still a marker everywhere that is not the panel it renders in
rowFor(c.w,"BUD").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).buddhaBrush===true,"Buddha Brush records");
rowFor(c.w,"SHA").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).shantiBrush===true,"Shanti Brush records");
const gl=[...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e=>e.textContent);
ok(gl.includes("WLK"),"Walk still has a month-grid row");
ok(!gl.includes("BUD")&&!gl.includes("SHA"),"but the once-a-week brushes are left off the table: "+gl.join(","));
// on a Sunday, the one day they are due -- any other day they correctly read
// "Not Due" instead of a streak, so pin the open day rather than flake on it
const bud=open({},{"dailyReadout.cur":JSON.stringify({d:(()=>{const d=new Date();while(d.getDay()!==0)d.setDate(d.getDate()-1);return iso(d);})(),on:TODAY})});
ok(rowFor(bud.w,"BUD").querySelector(".streak").textContent.endsWith("d"),
   "and carry a streak like any other on the day they are due: "+rowFor(bud.w,"BUD").querySelector(".streak").textContent);

console.log("\n-- the brushes are weekly, starting today --");
const lastSun=(()=>{const d=new Date();while(d.getDay()!==0)d.setDate(d.getDate()-1);return iso(d);})();
c=open({},{"dailyReadout.cur":JSON.stringify({d:lastSun,on:TODAY})});
ok(!rowFor(c.w,"BUD").classList.contains("notdue"),"due on Sunday: "+lastSun);
// a day after `since` that is not today: the app won't let you page past
// today, so the clock itself is pinned to view one
const nextTue=openFake("2026-09-01").w;
ok(nextTue.document.getElementById("date").textContent.length>0,"the pinned day opened");
ok(rowFor(nextTue,"BUD").classList.contains("notdue")&&rowFor(nextTue,"SHA").classList.contains("notdue"),
   "not due on a Tuesday, well after `since`");
// a lapse from before the practice existed must never surface as a guardrail miss
c=open({"dailyReadout.v1":JSON.stringify({
  "2026-06-01":{vitamins:true,_t:1}})});   // a Monday, long before either since-date, both due-but-undone if not for `since`
ok(!/Buddha|Shanti/.test(c.w.document.getElementById("guard").textContent),
   "no pre-existing lapse: "+c.w.document.getElementById("guard").textContent.slice(0,200));
ok(/\/\d/.test(c.w.document.getElementById("scoreD").textContent),
   "the readout still counts a denominator: "+c.w.document.getElementById("scoreD").textContent);
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"grid clean");

console.log("\n-- the day's target still varies --");
// find a Sunday and a weekday within this month's grid to compare Read's target
const sunday=(()=>{const d=new Date();while(d.getDay()!==0)d.setDate(d.getDate()-1);return iso(d);})();
c=open({},{"dailyReadout.cur":JSON.stringify({d:sunday,on:TODAY})});
ok(/30 Min/.test(title(c.w,"RDG")),"Sunday still shows the 30-minute target: "+title(c.w,"RDG"));

console.log("\n-- the dose rows --");
c=open({});
ok(!c.w.document.getElementById("extras"),"Daily Markers no longer carries its own dose block");
const sup=c.w.document.getElementById("supply");
ok(sup.classList.contains("doses"),"Vitamin Supply's block is a list of rows");
ok(sup.querySelectorAll(".doserow").length===3,"three rows: Refill Date, then Extra/Under IR & XR");
ok(!sup.querySelector(".gauge"),"no gauges");
const r0=[...sup.querySelectorAll(".doserow")][1];
ok(r0.querySelector(".dose-name").textContent==="Extra/Under IR:","label reads 'Extra/Under IR:'");
ok(r0.querySelector(".dose-unit").textContent==="mg","unit sits after the live reading");
const slider=r0.querySelector(".doseslider");
ok(!!slider&&slider.type==="range","a range slider, not a typed number field");
slider.value="10"; slider.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).extraIr===10,"dragging it still records");
ok(r0.querySelector(".dose-val").textContent==="+10","and the live reading shows the same value");

console.log("\n-- existing dose history still reads --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{extraIr:10,extraXr:15,_t:1}})});
const vals=[...c.w.document.querySelectorAll("#supply .doseslider")].map(i=>i.value);
ok(vals.join(",")==="10,15","10 and 15 come back into the sliders");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
