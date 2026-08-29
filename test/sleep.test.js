const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const TODAY=iso(new Date());
let copied="";
function open(jar){jar=jar||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     Object.defineProperty(w.navigator,"clipboard",{value:{writeText:t=>{copied=t;return Promise.resolve();}},configurable:true});
     for(const[n,st]of[["localStorage",jar],["sessionStorage",{}]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};
const css=HTML.replace(/\s+/g," ");

console.log("\n-- four across, one line each --");
let c=open({});
const cells=[...c.w.document.querySelectorAll("#stats .stat")];
ok(cells.length===4,"still four cells");
const labels=cells.map(e=>e.querySelector(".stat-label").textContent);
ok(labels.join(" | ")==="Sleep | CPAP | HRV | Rest HR","short labels: "+labels.join(" | "));
ok(labels.every(t=>t.length<=7),"none long enough to wrap in a quarter-width cell");
ok(/\.stats \{[^}]*grid-template-columns: repeat\(4, 1fr\)/.test(css),"one row of four, not two of two");
ok(/max-width: 359px\)[^}]*\{[^]*?\.stats \{ grid-template-columns: 1fr 1fr/.test(css),
   "narrow phones fall back to two by two");
ok(!/\.stat-label \{[^}]*min-height/.test(css),"the reserved second line is gone");
ok(/\.numin \{[^}]*font-size: 18px/.test(css),"the number is smaller");

console.log("\n-- the full names survive where they matter --");
const aria=cells.map(e=>e.querySelector("input").getAttribute("aria-label"));
ok(/Heart Rate Variability/.test(aria[2]),"a screen reader still hears the full name: "+aria[2]);
ok(/Sleep Score/.test(aria[0])&&/Heart Rate \(35/.test(aria[3]),"and the ranges");

console.log("\n-- and it still works --");
const inp=cells.map(e=>e.querySelector("input"));
inp[0].value="77"; inp[0].dispatchEvent(new c.w.Event("input",{bubbles:true}));
inp[2].value="22"; inp[2].dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).sleep===77&&store(c).hrv===22,"typing records");
inp[3].value="200"; inp[3].dispatchEvent(new c.w.Event("input",{bubbles:true}));
inp[3].dispatchEvent(new c.w.Event("blur",{bubbles:true}));
ok(store(c).hr===125,"clamping still holds");
ok(cells[0].querySelector(".gauge > i").style.width==="77%","the gauge still fills");
ok(/SLP77/.test(c.w.document.getElementById("chips").textContent.replace(/\s/g,"")),"chips unchanged");

console.log("\n-- the times row --");
ok(c.w.document.getElementById("bed").value==="21:00","bed default intact");
ok(c.w.document.getElementById("spanLabel").textContent==="Assumed","assumed label intact");
ok(/\.timein \{[^}]*min-height: 33px/.test(css),"the inputs are shorter");
ok(/\.times \{[^}]*padding: 11px 16px 3px/.test(css),"and the row tighter");

console.log("\n-- dead rules gone --");
ok(!/\.stats\.act/.test(css),"the .stats.act rules went with the dose cells they styled");

console.log("\n-- the export is unchanged --");
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  const head=copied.split("\n")[0];
  ok(/Sleep Score/.test(head)&&/Heart Rate Variability/.test(head),"still the full column names");
  ok(!/,Sleep,/.test(head),"not the short ones");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
