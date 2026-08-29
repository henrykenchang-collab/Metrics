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
const body=c=>c.w.document.getElementById("packBody").textContent.replace(/\s+/g," ").trim();
const bars=c=>[...c.w.document.querySelectorAll("#packBody .pace-row")]
  .map(r=>r.querySelector(".pace-l").textContent+"="+r.querySelector(".pace-v").textContent);
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};

console.log("\n-- the field --");
let c=open({});
const dr=c.w.document.getElementById("refillDate");
ok(!!dr,"a Refill Date field exists");
ok(dr.type==="date","it is a real date input, so phones give a picker");
ok(dr.closest(".doserow").querySelector(".dose-name").textContent==="Refill Date:","labelled, one line, like the others");
ok(c.w.document.getElementById("supply").querySelectorAll(".doserow").length===2,"two rows: Taken Today and Refill Date");
ok(!c.w.document.querySelector("#supply .dosein[aria-label^='Refill']"),"the old pack-size number field is gone");
ok(/Set a Refill Date/.test(body(c)),"empty state asks for the date: "+body(c).slice(0,70));

console.log("\n-- counting down from the date --");
dr.value=back(12); dr.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(store(c).refill===back(12),"the date is stored");
ok(bars(c).join(" | ")==="IR Supply Left=18/30 | XR Supply Left=48/60",
   "12 days in: 18 of 30 IR, 48 of 60 XR — "+bars(c).join(" | "));
ok(/IR runs out/.test(body(c))&&/XR/.test(body(c)),"both run-out dates read");
ok(c.w.document.getElementById("packHead").textContent.indexOf("Refilled")===0,"header names the refill");

console.log("\n-- Pack Used and Days Gone are gone --");
ok(!/Pack Used|Days Gone/.test(body(c)),"neither label remains");
ok(!c.w.document.querySelector("#packBody .spent, #packBody .gone"),"nor their bars");
ok(!/Doses Left/.test(body(c)),"and the big doses-left number is gone with them");

console.log("\n-- the edges --");
c=open({}); const d2=c.w.document.getElementById("refillDate");
d2.value=back(30); d2.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(bars(c)[0]==="IR Supply Left=0/30","exactly 30 days on: IR is empty");
ok(bars(c)[1]==="XR Supply Left=30/60","XR still has half");
ok(/IR ran out/.test(body(c)),"the note says so");
ok(/IR Supply/.test(c.w.document.getElementById("guard").textContent),"and the guardrail flags it");
c=open({}); const d3=c.w.document.getElementById("refillDate");
d3.value=back(25); d3.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(bars(c)[0]==="IR Supply Left=5/30","five days left");
ok(/5 days.*left.*refill by/i.test(c.w.document.getElementById("guard").textContent.replace(/\s+/g," ")),
   "warned before it runs out, not after");
c=open({}); const d4=c.w.document.getElementById("refillDate");
d4.value=TODAY; d4.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(bars(c).join("|")==="IR Supply Left=30/30|XR Supply Left=60/60","refilled today: full");
ok(!/Supply/.test(c.w.document.getElementById("guard").textContent),"nothing to warn about");

console.log("\n-- a later entry corrects an earlier one --");
c=open({"dailyReadout.v1":JSON.stringify({
  [back(40)]:{refill:back(40),_t:1},
  [back(5)]:{refill:back(5),_t:1}})});
ok(bars(c)[0]==="IR Supply Left=25/30","the most recent refill wins: "+bars(c)[0]);
ok(c.w.document.getElementById("refillDate").value===back(5),"and the field shows it");

console.log("\n-- Taken Today survived --");
ok(c.w.document.querySelector("#supply .dosein"),"the doses field is still there");
const t=c.w.document.querySelector("#supply .dosein");
t.value="2"; t.dispatchEvent(new c.w.Event("input",{bubbles:true}));
ok(store(c).irTaken===2,"and still records");

console.log("\n-- the export --");
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  const head=copied.split("\n")[0];
  ok(/Refill Date/.test(head)&&/IR Days Left/.test(head)&&/XR Days Left/.test(head),"new columns");
  ok(!/IR Refill|IR Left,/.test(head),"old pack columns gone");
  const line=copied.split("\n").find(l=>l.indexOf(back(5))===0)||"";
  ok(line.indexOf(back(5))>=0,"the refill date is in the row");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
