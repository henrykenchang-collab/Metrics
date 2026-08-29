const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const back=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
function open(jar){jar=jar||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     for(const[n,st]of[["localStorage",jar],["sessionStorage",{}]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const sub=(w,c)=>{const r=[...w.document.getElementById("rows").children]
  .find(b=>b.querySelector(".row-code").textContent===c);
  const s=r.querySelector(".row-sub"); return s&&s.textContent?s.textContent.trim().replace(/^:\s*/,""):null;};

console.log("\n== 1. Read skips Saturday ==");
let c=open({});
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
ok(labels.includes("SLP")&&labels.includes("HRV")&&labels.includes("HR"),"biometrics still there");
ok(labels.includes("WRK")&&labels.includes("ENG"),"self-rated still there");
const rules=c.w.document.getElementById("grid").querySelectorAll(".grid-rule").length;
ok(rules===2,"two dividers, not three with an empty band: "+rules);

console.log("\n== 3. the Extras heading is gone ==");
const txt=c.w.document.body.textContent;
ok(!/Leave Blank if None/.test(txt),'"Leave Blank if None" gone');
ok(c.w.document.getElementById("extras").children.length===2,"the two dose fields remain");
ok(/Extra IR/.test(txt)&&/Extra XR/.test(txt),"each still carries its own label");

console.log("\n== 4. IR Supply condensed and last ==");
const panels=[...c.w.document.querySelectorAll("section.panel")];
const heads=panels.map(p=>p.querySelector(".panel-head .code").textContent);
ok(heads[heads.length-1]==="IR Supply","IR Supply is the last panel: "+heads.join(" | "));
ok(heads.indexOf("Patterns")===heads.length-2,"and sits directly under Patterns");
ok(!!c.w.document.getElementById("supply"),"its inputs came with it");

c=open({"dailyReadout.v1":JSON.stringify({
  [back(9)]:{irFill:30,irTaken:2,_t:1},[back(8)]:{irTaken:2,_t:1},[back(7)]:{irTaken:2,_t:1},
  [back(6)]:{irTaken:2,_t:1},[back(5)]:{irTaken:2,_t:1},[back(4)]:{irTaken:2,_t:1},
  [back(3)]:{irTaken:2,_t:1},[back(2)]:{irTaken:2,_t:1},[back(1)]:{irTaken:2,_t:1}})});
const body=c.w.document.getElementById("packBody");
ok(body.querySelectorAll(".pack-top .bar").length===0,"the redundant top bar is gone");
ok(body.querySelectorAll(".pace-row").length===2,"the two comparison bars are what remain");
ok(/Doses Left/.test(body.textContent)&&/a day/.test(body.textContent),"count and rate still read");
ok(/runs out/.test(body.textContent),"the projection still reads");
ok(c.w.document.getElementById("packHead").textContent==="Pack of 30","header still names the pack");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
