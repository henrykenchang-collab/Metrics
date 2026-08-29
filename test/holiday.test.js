const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const TODAY=iso(new Date());
let copied="";
function open(jar,cur,fakeToday){
  const sess=cur?{"dailyReadout.cur":JSON.stringify({d:cur,on:fakeToday||TODAY})}:{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     if(fakeToday){const R=w.Date,f=fakeToday+"T12:00:00";
       function F(...a){return a.length?new R(...a):new R(f);}
       F.prototype=R.prototype;F.now=()=>new R(f).getTime();F.parse=R.parse;F.UTC=R.UTC;w.Date=F;}
     Object.defineProperty(w.navigator,"clipboard",{value:{writeText:t=>{copied=t;return Promise.resolve();}},configurable:true});
     for(const[n,st]of[["localStorage",jar||{}],["sessionStorage",sess]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar:jar||{}};
}
const fluPills=w=>[...w.document.getElementById("choices").children[1].querySelectorAll(".pill")];
const moodPills=w=>[...w.document.getElementById("choices").children[0].querySelectorAll(".pill")];
const dow=w=>w.document.getElementById("dow").textContent;
const day=(c,k)=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[k]||{};

console.log("\n-- the N/A category --");
let c=open({});
ok(fluPills(c.w).map(p=>p.textContent).join(",")==="Bad,Average,Good,N/A","fluency gains N/A");
ok(moodPills(c.w).map(p=>p.textContent).join(",")==="Bad,Average,Good","mood does not");
ok(fluPills(c.w)[3].classList.contains("na-pill"),"styled apart from the verdicts");

console.log("\n-- 2026 federal holidays, computed --");
// each of the eleven, on a weekday so the weekend rule is not doing the work
const H={"2026-01-01":"New Year's Day","2026-01-19":"Martin Luther King Jr. Day",
 "2026-02-16":"Presidents' Day","2026-05-25":"Memorial Day","2026-06-19":"Juneteenth",
 "2026-07-03":"Independence Day","2026-09-07":"Labor Day","2026-10-12":"Columbus Day",
 "2026-11-11":"Veterans Day","2026-11-26":"Thanksgiving","2026-12-25":"Christmas Day"};
for (const [k,name] of Object.entries(H)) {
  const x=open({},k,k);
  ok(dow(x.w).indexOf(name)>=0, k+" -> "+dow(x.w));
}

console.log("\n-- the observed shift --");
// 4 July 2026 is a Saturday, so the holiday is taken on Friday the 3rd
let x=open({},"2026-07-04","2026-07-04");
ok(!/Independence/.test(dow(x.w)),"4 July, a Saturday, is not itself the observed day");
x=open({},"2026-07-03","2026-07-03");
ok(/Independence Day/.test(dow(x.w)),"the Friday before is: "+dow(x.w));
// 1 Jan 2028 is a Saturday -> observed 31 Dec 2027, in the previous year
x=open({},"2027-12-31","2027-12-31");
ok(/New Year/.test(dow(x.w)),"a New Year observed in December is still found: "+dow(x.w));

console.log("\n-- fluency defaults on a day off --");
x=open({},"2026-11-26","2026-11-26");            // Thanksgiving, a Thursday
ok(fluPills(x.w)[3].classList.contains("on"),"N/A is lit on Thanksgiving");
ok(fluPills(x.w).slice(0,3).every(p=>!p.classList.contains("on")),"no verdict with it");
[...x.w.document.getElementById("rows").children][0].dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));
ok(day(x,"2026-11-26").fluency==="na","logging anything commits it");
ok((day(x,"2026-11-26")._na||[]).indexOf("fluency")>=0,"flagged as the app's doing, not yours");

x=open({},"2026-11-25","2026-11-25");            // the Wednesday before
ok(!fluPills(x.w)[3].classList.contains("on"),"an ordinary Wednesday starts blank");

console.log("\n-- work productivity follows the same rule --");
const wrkNA=w=>w.document.getElementById("rates").children[4].querySelector(".na-seg");
const wrkSegs=w=>[...w.document.getElementById("rates").children[4].querySelectorAll(".seg:not(.na-seg)")];
x=open({},"2026-11-26","2026-11-26");                 // Thanksgiving, a Thursday
ok(wrkNA(x.w).classList.contains("on"),"N/A is lit for work on Thanksgiving too");
ok(wrkSegs(x.w).every(b=>!b.classList.contains("on")),"no score lit with it");
[...x.w.document.getElementById("rows").children][0].dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));
ok(day(x,"2026-11-26").work==="na","and it commits when the day is logged");
ok((day(x,"2026-11-26")._na||[]).indexOf("work")>=0,"flagged as the app's doing");
x=open({},"2026-11-25","2026-11-25");
ok(!wrkNA(x.w).classList.contains("on"),"an ordinary Wednesday still asks for a score");
x=open({},"2026-07-03","2026-07-03");                 // observed Independence Day, a Friday
ok(wrkNA(x.w).classList.contains("on"),"an observed holiday counts, not just the real date");
x=open({},"2026-07-02","2026-07-02");
ok(!wrkNA(x.w).classList.contains("on"),"the day before does not");
x=open({},"2026-11-26","2026-11-26");
wrkSegs(x.w)[7].dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));
ok(day(x,"2026-11-26").work===5,"a score on a holiday overrides");
ok((day(x,"2026-11-26")._na||[]).indexOf("work")<0,"and clears its flag");
ok(day(x,"2026-11-26").fluency==="na","without disturbing the fluency N/A");

console.log("\n-- choosing makes it yours --");
x=open({},"2026-11-26","2026-11-26");
fluPills(x.w)[2].dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));   // Good
ok(day(x,"2026-11-26").fluency==="good","a verdict on a holiday overrides");
ok((day(x,"2026-11-26")._na||[]).indexOf("fluency")<0,"and clears the flag");

console.log("\n-- an assumed N/A never keeps a day alive --");
x=open({},"2026-11-26","2026-11-26");
const vit=[...x.w.document.getElementById("rows").children][0];
vit.dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));
ok(day(x,"2026-11-26").vitamins===true,"marker on");
vit.dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));
ok(JSON.parse(x.jar["dailyReadout.v1"])["2026-11-26"]===undefined,
   "undoing it drops the day, N/A and all");

console.log("\n-- it stays out of the arithmetic --");
x=open({"dailyReadout.v1":JSON.stringify({
  "2026-11-25":{fluency:"good",mood:"good",_t:1},
  "2026-11-26":{fluency:"na",vitamins:true,_t:1}})},"2026-11-25","2026-11-27");
ok(!/NaN/.test(x.w.document.getElementById("grid").innerHTML),"no NaN in the grid");
const flu=x.w.document.getElementById("grid").querySelector('.sq[data-d="2026-11-26"][title^="FLU"]');
ok(flu.classList.contains("napp")&&flu.textContent==="N/A","an N/A night reads N/A in the grid");
const sums=[...x.w.document.getElementById("grid").querySelectorAll(".grid-sum")].map(e=>e.textContent);
ok(!sums.some(t=>/NaN/.test(t)),"and the averages stay clean: "+sums.filter(Boolean).slice(-5).join(" "));
ok(!/FLU/.test(x.w.document.getElementById("chips").textContent)||
   !/FLUN\/A/.test(x.w.document.getElementById("chips").textContent.replace(/\s/g,"")),
   "no empty chip for it");

console.log("\n-- the export --");
x.w.document.getElementById("copyBtn").dispatchEvent(new x.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  const line=copied.split("\n").find(l=>l.indexOf("2026-11-26")===0)||"";
  ok(/N\/A/.test(line),"N/A exports as N/A: "+line.slice(-40));
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
