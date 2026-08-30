const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const back=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
function open(jar,sess){jar=jar||{};sess=sess||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     for(const[n,st]of[["localStorage",jar],["sessionStorage",sess]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const sub=(w,c)=>{const r=[...w.document.getElementById("rows").children]
  .find(b=>b.querySelector(".row-code").textContent===c);
  const s=r.querySelector(".row-sub"); return s&&s.textContent?s.textContent.trim().replace(/^:\s*/,""):null;};

console.log("\n== 1. Read skips Saturday ==");
const iso2=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const TODAY=iso2(new Date());
// Read's target varies by weekday (30 Min on Sunday), so this checks the
// ordinary case on a pinned Monday rather than on whatever "today" is
const monday=(()=>{const d=new Date();while(d.getDay()!==1)d.setDate(d.getDate()-1);return iso2(d);})();
let c=open({},{"dailyReadout.cur":JSON.stringify({d:monday,on:TODAY})});
ok(sub(c.w,"RDG")==="15 Min · Not Sat",'reads "15 Min · Not Sat", got: '+JSON.stringify(sub(c.w,"RDG")));
ok(sub(c.w,"SAU")==="Sun–Tue","sauna untouched");
ok(sub(c.w,"GRN")==="Sun · Mon · Wed","greens untouched");
ok(sub(c.w,"KET")===null,"keto still every day");

console.log("\n== 2. the month grid drops the dose rows ==");
const labels=[...c.w.document.getElementById("grid").querySelectorAll(".grid-label")]
  .map(e=>e.textContent).filter(Boolean);
ok(!labels.includes("IR"),"no IR row");
ok(!labels.includes("XR"),"no XR row");
ok(!labels.includes("IRT"),"no IRT row");
ok(labels.includes("VIT")&&labels.includes("WLK"),"markers still there");
ok(labels.includes("CPAP")&&!labels.includes("SLP")&&!labels.includes("HRV")&&!labels.includes("HR"),
   "CPAP is the only sleep metric on the table now: "+labels.join(","));
ok(labels.includes("WRK")&&labels.includes("ENG"),"self-rated still there");
const rules=c.w.document.getElementById("grid").querySelectorAll(".grid-rule").length;
ok(rules===2,"two dividers, not three with an empty band: "+rules);

console.log("\n== 3. the Extras heading is gone ==");
const txt=c.w.document.body.textContent;
ok(!/Leave Blank if None/.test(txt),'"Leave Blank if None" gone');
ok(c.w.document.getElementById("extras").children.length===2,"the two dose fields remain");
ok(/Extra IR/.test(txt)&&/Extra XR/.test(txt),"each still carries its own label");

console.log("\n== 4. Vitamin Supply condensed and last ==");
const panels=[...c.w.document.querySelectorAll("section.panel")];
const heads=panels.map(p=>p.querySelector(".panel-head .code").textContent);
ok(heads[heads.length-1]==="Vitamin Supply","Vitamin Supply is the last panel: "+heads.join(" | "));
ok(heads.indexOf("Patterns")===heads.length-2,"and sits directly under Patterns");
ok(!!c.w.document.getElementById("supply"),"its inputs came with it");

c=open({});
const dr=c.w.document.getElementById("refillDate");
dr.value=back(12); dr.dispatchEvent(new c.w.Event("change",{bubbles:true}));
const body=c.w.document.getElementById("packBody");
ok(body.querySelectorAll(".pack-top").length===0,"the big score block is gone");
ok(body.querySelectorAll(".pace-row").length===2,"two bars, one per drug");
ok(/IR Supply Left/.test(body.textContent)&&/XR Supply Left/.test(body.textContent),
   "they read IR and XR supply left");
ok(/lasts through/.test(body.textContent),"the coverage dates still read");
ok(c.w.document.getElementById("packHead").textContent.indexOf("Refilled")===0,
   "header names the refill date");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
