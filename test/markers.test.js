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
// markers render into Daily Markers or, when grouped, into their own panel
const rowFor=(w,c)=>[...w.document.querySelectorAll("#rows > *, #petrows > *")]
  .find(b=>b.querySelector(".row-code").textContent===c);
const title=(w,c)=>rowFor(w,c).querySelector(".row-name").textContent.trim();
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};

console.log("\n-- Gym --");
let c=open({});
ok(!!rowFor(c.w,"GYM"),"a GYM row exists");
ok(title(c.w,"GYM")==="Gym: Sun · Mon · Thu · Fri","reads: "+JSON.stringify(title(c.w,"GYM")));
ok(c.w.document.querySelectorAll("#rows > *, #petrows > *").length===13,"thirteen markers now, across two panels");
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
ok(rowFor(c.w,"SAU").querySelectorAll(".row-name > *").length===1,"one line, one nested span");

console.log("\n-- Shanti and Buddha --");
c=open({});
const heads=[...c.w.document.querySelectorAll("section.panel .panel-head .code:first-child")].map(e=>e.textContent);
ok(heads.indexOf("Shanti and Buddha")===heads.indexOf("Daily Markers")+1,
   "its panel sits right after Daily Markers: "+heads.join(" | "));
const pets=[...c.w.document.getElementById("petrows").children]
  .map(b=>b.querySelector(".row-name").textContent.trim());
ok(pets.join(" | ")==="Walk with Shanti: PM · Not Sat | Buddha Brush | Shanti Brush",
   "the three activities, in order: "+pets.join(" | "));
ok(!c.w.document.getElementById("rows").textContent.match(/Shanti|Buddha/),
   "and none of them is left behind in Daily Markers");
// a grouped marker is still a marker everywhere that is not the panel it renders in
rowFor(c.w,"BUD").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).buddhaBrush===true,"Buddha Brush records");
rowFor(c.w,"SHA").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).shantiBrush===true,"Shanti Brush records");
const gl=[...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e=>e.textContent);
ok(gl.includes("WLK")&&gl.includes("BUD")&&gl.includes("SHA"),"all three have month-grid rows");
ok(rowFor(c.w,"BUD").querySelector(".streak").textContent.endsWith("d"),"and carry a streak like any other");
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
const ex=c.w.document.getElementById("extras");
ok(ex.classList.contains("doses"),"the extras block is a list of rows now");
ok(ex.querySelectorAll(".doserow").length===2,"two rows");
ok(!ex.querySelector(".gauge"),"no gauges");
const r0=ex.querySelectorAll(".doserow")[0];
ok(r0.querySelector(".dose-name").textContent==="Extra/Under IR:","label reads 'Extra/Under IR:'");
ok(r0.querySelector(".dose-unit").textContent==="mg","unit sits after the number");
const parts=[...r0.children].map(e=>e.className);
ok(parts.join(">")==="dose-name>dosein>dose-unit","label, then number, then unit, in one row: "+parts.join(" > "));
ok(r0.querySelector(".dosein").placeholder==="––","the number field shows a placeholder until filled");
const inp=r0.querySelector(".dosein");
inp.value="10"; inp.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).extraIr===10,"typing still records");
inp.value="99"; inp.dispatchEvent(new c.w.Event("input",{bubbles:true}));
inp.dispatchEvent(new c.w.Event("blur",{bubbles:true}));
ok(store(c).extraIr===40,"and still clamps to the 5-40 range on blur");

console.log("\n-- the supply panel kept its tall cells --");
const sup=c.w.document.getElementById("supply");
ok(sup.classList.contains("doses"),"IR Supply now uses the same one-line rows");
ok(!sup.querySelector(".gauge"),"its gauges are gone with them");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"grid clean");

console.log("\n-- existing dose history still reads --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{extraIr:10,extraXr:15,_t:1}})});
const vals=[...c.w.document.querySelectorAll("#extras .dosein")].map(i=>i.value);
ok(vals.join(",")==="10,15","10 and 15 come back into the fields");
ok(/IR10mg/.test(c.w.document.getElementById("chips").textContent.replace(/\s/g,"")),"chips unchanged");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
