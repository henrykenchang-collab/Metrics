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
const rowFor=(w,c)=>[...w.document.getElementById("rows").children]
  .find(b=>b.querySelector(".row-code").textContent===c);
const title=(w,c)=>rowFor(w,c).querySelector(".row-name").textContent.trim();
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};

console.log("\n-- Gym --");
let c=open({});
ok(!!rowFor(c.w,"GYM"),"a GYM row exists");
ok(title(c.w,"GYM")==="Gym: Sun · Mon · Thu · Fri","reads: "+JSON.stringify(title(c.w,"GYM")));
ok(c.w.document.getElementById("rows").children.length===12,"twelve markers now");
rowFor(c.w,"GYM").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).gym===true,"it records");
const labels=[...c.w.document.getElementById("grid").querySelectorAll(".grid-label")].map(e=>e.textContent);
ok(labels.includes("GYM"),"and has its own row in the month grid");

console.log("\n-- schedules ride on the name --");
ok(title(c.w,"SAU")==="Sauna: Sun–Tue","Sauna: Sun–Tue");
ok(title(c.w,"GRN")==="Greens: Sun · Mon · Wed","Greens: Sun · Mon · Wed");
ok(title(c.w,"CLD")==="Cold Plunge: Not Sat","Cold Plunge: Not Sat");
ok(title(c.w,"WGT")==="Weights: Sun · Mon · Tue · Fri","Weights spelled out");
ok(title(c.w,"VIT")==="Vitamins","a marker with no schedule keeps just its name");
ok(title(c.w,"KET")==="Keto","and so does Keto");
ok(title(c.w,"WLK")==="Walk: PM · Not Sat","target and schedule combine");
ok(/^Read: 15 Min · Not Sat$|^Read: 30 Min · Not Sat$/.test(title(c.w,"RDG")),
   "Read carries its target too: "+title(c.w,"RDG"));
ok(rowFor(c.w,"SAU").querySelectorAll(".row-name > *").length===1,"one line, one nested span");

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
ok(r0.querySelector(".dose-name").textContent==="Extra IR:","label reads 'Extra IR:'");
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
ok(sup.classList.contains("stats"),"IR Supply still uses stat cells");
ok(sup.querySelectorAll(".gauge").length===2,"gauges intact there");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"grid clean");

console.log("\n-- existing dose history still reads --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{extraIr:10,extraXr:15,_t:1}})});
const vals=[...c.w.document.querySelectorAll("#extras .dosein")].map(i=>i.value);
ok(vals.join(",")==="10,15","10 and 15 come back into the fields");
ok(/IR10mg/.test(c.w.document.getElementById("chips").textContent.replace(/\s/g,"")),"chips unchanged");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
