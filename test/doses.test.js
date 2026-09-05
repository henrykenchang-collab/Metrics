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
const slide=(c,el,v)=>{el.value=String(v); el.dispatchEvent(new c.w.Event("input",{bubbles:true}));};

console.log("\n-- the refill day is a full 30 --");
let c=open({}); setDate(c,TODAY);
ok(bars(c)[0]==="30/30","refill today reads 30/30 — today's dose came from the previous refill");
ok(bars(c)[1]==="30/30","XR likewise, now that a refill covers 30 days of it too");
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
ok(!c.w.document.querySelector("#supply .dosein"),"no plain number field left in the supply block");

console.log("\n-- Extra/Under now lives in the Vitamin Supply panel, alongside Refill Date --");
const names=[...c.w.document.querySelectorAll("#supply .dose-name")].map(e=>e.textContent);
ok(names.join(" | ")==="Refill Date: | Extra/Under IR: | Extra/Under XR:","one compact block: "+names.join(" | "));
ok(c.w.document.getElementById("supply").querySelectorAll(".doserow").length===3,"three rows: date, IR, XR");
const ir=c.w.document.querySelectorAll("#supply .doseslider")[0], xr=c.w.document.querySelectorAll("#supply .doseslider")[1];
// a native range input, not a bare text field, so it drags with a thumb
// rather than asking for keyboard precision -- the same reuse of a native
// control Bed/Wake already get from type="time"
ok(ir.type==="range","a native range input");
ok(ir.min==="-30"&&ir.max==="60"&&ir.step==="5","IR's min/max/step match its own range");
ok(xr.min==="-40"&&xr.max==="40"&&xr.step==="5","XR's min/max/step match its own, independently");
slide(c,ir,-20);
ok(store(c).extraIr===-20,"a negative records: "+store(c).extraIr);
slide(c,ir,15);
ok(store(c).extraIr===15,"positives still work");
const readout=r=>r.parentElement.querySelector(".dose-val").textContent;
ok(readout(ir)==="+15","a positive reading is prefixed with a plus sign: "+readout(ir));
slide(c,ir,-5);
ok(readout(ir)==="-5","a negative reading carries its own sign, no double minus: "+readout(ir));

console.log("\n-- the slider itself enforces the clamp, no separate blur step needed --");
{
  const c2=open({});
  const ir2=c2.w.document.querySelectorAll("#supply .doseslider")[0];
  ir2.value="999";   // the browser's own range input clamps an out-of-range assignment
  ok(+ir2.value===60,"assigning past the max clamps to it: "+ir2.value);
  ir2.value="-999";
  ok(+ir2.value===-30,"and past the min clamps the other way: "+ir2.value);
}

console.log("\n-- Extra/Under scales what a day draws against supply, per its own baseline dose --");
{
  // IR's baseline is 20mg/day: a full extra dose (+20mg) on one of the
  // twelve elapsed days draws a full extra day; an equal under-dose (-20mg)
  // draws nothing that day. XR's baseline is 30mg/day, tracked independently.
  const base = open({"dailyReadout.v1":JSON.stringify({[back(12)]:{refill:back(12),_t:1}})});
  ok(bars(base).join(" | ")==="18/30 | 18/30","baseline, no extras: 12 days in reads 18/30 for both");

  const plusIr = open({"dailyReadout.v1":JSON.stringify({
    [back(12)]:{refill:back(12),_t:1}, [back(5)]:{extraIr:20,_t:1}})});
  ok(bars(plusIr)[0]==="17/30","+20mg IR on one day draws a full extra day of IR: "+bars(plusIr)[0]);
  ok(bars(plusIr)[1]==="18/30","and never touches XR: "+bars(plusIr)[1]);

  const minusIr = open({"dailyReadout.v1":JSON.stringify({
    [back(12)]:{refill:back(12),_t:1}, [back(5)]:{extraIr:-20,_t:1}})});
  ok(bars(minusIr)[0]==="19/30","a full IR under-dose that same day draws none, so a day is given back: "+bars(minusIr)[0]);

  const plusXr = open({"dailyReadout.v1":JSON.stringify({
    [back(12)]:{refill:back(12),_t:1}, [back(5)]:{extraXr:30,_t:1}})});
  ok(bars(plusXr)[1]==="17/30","+30mg XR (its own full dose) draws a full extra day of XR: "+bars(plusXr)[1]);
  ok(bars(plusXr)[0]==="18/30","and never touches IR: "+bars(plusXr)[0]);

  const rested = open({"dailyReadout.v1":JSON.stringify({
    [back(12)]:{refill:back(12),_t:1}, [back(5)]:{extraIr:40,dailyRest:true,_t:1}})});
  ok(bars(rested).join(" | ")==="19/30 | 19/30",
     "Daily Rest excludes the day entirely, regardless of any extra logged that day: "+bars(rested).join(" | "));
}

console.log("\n-- the minus stays out of the measured fields --");
c=open({});
const sleep=c.w.document.querySelectorAll("#stats .numin")[0];
sleep.value="-40"; sleep.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(sleep.value==="40","sleep score refuses a minus sign: "+sleep.value);
ok(store(c).sleep===40,"and stores the positive");

console.log("\n-- export --");
c=open({});
const x=c.w.document.querySelectorAll("#supply .doseslider")[1];
slide(c,x,-20);
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
