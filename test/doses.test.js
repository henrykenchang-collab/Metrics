const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const back=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
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
const bars=c=>[...c.w.document.querySelectorAll("#packBody .pace-row")].map(r=>r.querySelector(".pace-v").textContent);
const note=c=>c.w.document.getElementById("packBody").textContent.replace(/\s+/g," ").trim();
const setDate=(c,v)=>{const e=c.w.document.getElementById("refillDate");
  e.value=v; e.dispatchEvent(new c.w.Event("change",{bubbles:true}));};

console.log("\n-- the refill day is a full 30 --");
let c=open({}); setDate(c,TODAY);
ok(bars(c)[0]==="30/30","refill today reads 30/30 — today's dose came from the previous refill");
ok(bars(c)[1]==="60/60","XR likewise");
c=open({}); setDate(c,back(1));
ok(bars(c)[0]==="29/30","one day on: 29");
c=open({}); setDate(c,back(29));
ok(bars(c)[0]==="1/30","day 29: one left");
c=open({}); setDate(c,back(30));
ok(bars(c)[0]==="0/30","day 30: zero left, which is the last day it covers");
ok(/last day/.test(note(c)),"and the copy says last day, not 'ran out': "+note(c).slice(0,60));
c=open({}); setDate(c,back(10));
ok(/lasts through/.test(note(c)),'while running, it reads "lasts through": '+note(c).slice(0,60));

console.log("\n-- Taken Today is gone --");
c=open({});
ok(!/Taken Today/.test(c.w.document.body.textContent),"the label is nowhere on the page");
ok(!c.w.document.querySelector("#supply .dosein"),"no number field left in the supply block");
ok(c.w.document.getElementById("supply").querySelectorAll(".doserow").length===1,"one row: the date");
ok(!!c.w.document.getElementById("refillDate"),"which is still the date field");

console.log("\n-- Extra/Under --");
const names=[...c.w.document.querySelectorAll("#extras .dose-name")].map(e=>e.textContent);
ok(names.join(" | ")==="Extra/Under IR: | Extra/Under XR:","headers read: "+names.join(" | "));
const ir=c.w.document.querySelectorAll("#extras .dosein")[0];
// a real number input, not a bare text field, so the up/down spinner and a
// mouse-wheel scroll while focused both work -- the same reuse of a native
// control Bed/Wake already get from type="time"
ok(ir.type==="number","a native number input");
ok(ir.min==="-40"&&ir.max==="40"&&ir.step==="1","min/max/step match the field's own range");
ir.value="-20"; ir.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).extraIr===-20,"a negative records: "+store(c).extraIr);
ir.value="-"; ir.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).extraIr===undefined,"a lone minus is not a number yet, so nothing is stored for it");
ir.value="-5"; ir.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).extraIr===-5,"then -5 lands");
ir.value="15"; ir.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).extraIr===15,"positives still work");
ir.value="-99"; ir.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ir.dispatchEvent(new c.w.Event("blur",{bubbles:true}));
ok(store(c).extraIr===-40,"and it clamps at -40");

console.log("\n-- the minus stays out of the measured fields --");
c=open({});
const sleep=c.w.document.querySelectorAll("#stats .numin")[0];
sleep.value="-40"; sleep.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(sleep.value==="40","sleep score refuses a minus sign: "+sleep.value);
ok(store(c).sleep===40,"and stores the positive");

console.log("\n-- export --");
c=open({});
const x=c.w.document.querySelectorAll("#extras .dosein")[1];
x.value="-20"; x.dispatchEvent(new c.w.Event("input",{bubbles:true}));
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  const head=copied.split("\n")[0];
  ok(/Extra\/Under IR \(mg\)/.test(head),"export header renamed");
  ok(!/IR Taken/.test(head),"and the Taken column is gone");
  ok(/Refill Date/.test(head)&&/IR Days Left/.test(head),"the refill columns remain");
  ok(/-20/.test(copied.split("\n").find(l=>l.indexOf(TODAY)===0)||""),"a negative survives the export");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
