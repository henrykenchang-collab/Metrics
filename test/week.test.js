const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const TODAY=iso(new Date());
// build a log on a chosen weekday by pinning the open day through sessionStorage
const dayOfWeek=n=>{const d=new Date();while(d.getDay()!==n)d.setDate(d.getDate()-1);return iso(d);};
const shift=(k,n)=>{const p=k.split("-");const d=new Date(+p[0],+p[1]-1,+p[2]);d.setDate(d.getDate()+n);return iso(d);};
function open(jar,cur,fakeToday){
  const sess=cur?{"dailyReadout.cur":JSON.stringify({d:cur,on:fakeToday||TODAY})}:{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     if (fakeToday) {                       // the guardrail reads the clock, not the open day
       const Real=w.Date, fixed=fakeToday+"T12:00:00";
       function Fake(...a){ return a.length ? new Real(...a) : new Real(fixed); }
       Fake.prototype=Real.prototype; Fake.now=()=>new Real(fixed).getTime();
       Fake.parse=Real.parse; Fake.UTC=Real.UTC; w.Date=Fake;
     }
     for(const[n,st]of[["localStorage",jar||{}],["sessionStorage",sess]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return w;
}
const guard=w=>w.document.getElementById("guard").textContent.replace(/\s+/g," ");
const week=w=>{const e=w.document.querySelector(".pack-week");return e?e.textContent.replace(/\s+/g," "):null;};

// the Monday of the current week, and how many days of it have happened
const mon=(()=>{const d=new Date();const b=d.getDay()===0?6:d.getDay()-1;d.setDate(d.getDate()-b);return iso(d);})();
const elapsed=(()=>{const t=new Date(),m=new Date(mon.split("-")[0],mon.split("-")[1]-1,mon.split("-")[2]);
  return Math.round((t-m)/86400000);})();
const leftInWeek=7-elapsed;

console.log("\n-- the week is Monday to Sunday --");
let w=open({"dailyReadout.v1":JSON.stringify({[mon]:{extraIr:20,_t:1}})});
ok(week(w)!==null,"a week line appears once there is anything to add up");
ok(/\+20 mg/.test(week(w)),"the balance reads +20 mg: "+week(w));
ok(/to offset/.test(week(w)),"and says how long is left to offset it");
// a day before this Monday must not be counted
w=open({"dailyReadout.v1":JSON.stringify({[shift(mon,-1)]:{extraIr:40,_t:1},[mon]:{extraIr:20,_t:1}})});
ok(/\+20 mg/.test(week(w)),"last week's Sunday is not in this week's balance: "+week(w));

console.log("\n-- taking early and giving it back --");
w=open({"dailyReadout.v1":JSON.stringify({[mon]:{extraIr:20,_t:1},[shift(mon,1)]:{extraIr:-20,_t:1}})});
ok(/\+?0 mg/.test(week(w)),"two on Monday and none on Tuesday nets to zero: "+week(w));
ok(!/to offset/.test(week(w)),"nothing left to offset when the week is level");
ok(!/IR This Week/.test(guard(w)),"and nothing is flagged");

console.log("\n-- nothing is said while there is still room --");
// Monday over, with the whole week ahead: quiet
w=open({"dailyReadout.v1":JSON.stringify({[mon]:{extraIr:20,_t:1}})},mon);
ok(!/IR This Week/.test(guard(w))||leftInWeek<=2,
   "an overage early in the week waits for Saturday rather than nagging on Monday");

console.log("\n-- but it speaks near the end --");
// pin the clock to a Sunday: the week's last day, one chance left to offset
const sunday=dayOfWeek(0), itsMonday=shift(sunday,-6);
w=open({"dailyReadout.v1":JSON.stringify({[itsMonday]:{extraIr:20,_t:1},[sunday]:{keto:true,_t:1}})},null,sunday);
ok(/IR This Week/.test(guard(w)),"on Sunday, a week still over gets flagged");
ok(/\+20 mg/.test(guard(w)),"naming the amount: "+(guard(w).match(/IR This Week[^.]*\./)||[""])[0]);
ok(/week finished/.test(guard(w)),"and that the week is done, not that some days remain");
ok(/over/.test(w.document.querySelector(".pack-week").className),"the panel line turns too");
// the same overage on the Monday itself stays quiet
w=open({"dailyReadout.v1":JSON.stringify({[itsMonday]:{extraIr:20,_t:1}})},null,itsMonday);
ok(!/IR This Week/.test(guard(w)),"the identical overage on Monday says nothing — six days can absorb it");
ok(/6 days to offset/.test(week(w)),"it reports the six days after today: "+week(w));

console.log("\n-- a week under the usual is never a problem --");
w=open({"dailyReadout.v1":JSON.stringify({[itsMonday]:{extraIr:-20,_t:1},[sunday]:{keto:true,_t:1}})},null,sunday);
ok(!/IR This Week/.test(guard(w)),"being under is not flagged");
ok(/-20 mg/.test(week(w)),"though the balance still reads: "+week(w));

console.log("\n-- the journal is smaller --");
w=open({});
const css=HTML.replace(/\s+/g," ");
ok(/\.notes \{[^}]*font-size: 13\.5px/.test(css),"the what-changed field drops to 13.5px");
ok(/\.notes \{[^}]*min-height: 84px/.test(css),"but keeps its height");

console.log("\n-- the energy chart is gone --");
ok(!w.document.getElementById("curve"),"no curve element");
ok(!/renderCurve/.test(HTML),"and no code left behind for it");
ok(!/\.curve \{/.test(css),"nor styles");
ok(w.document.getElementById("rates").children.length===5,"the five rating rows are untouched");

console.log("\n-- Meals sits under Sleep & Recovery --");
const heads=[...w.document.querySelectorAll("section.panel .panel-head .code:first-child")].map(e=>e.textContent);
ok(heads.join(" | ").indexOf("Sleep & Recovery | Meals")>=0,"order: "+heads.join(" | "));
ok(!!w.document.getElementById("mealAdd"),"and its button came with it");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
