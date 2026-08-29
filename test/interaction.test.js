const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const back=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
const TODAY=iso(new Date());

function open(jar){ jar=jar||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     for(const[n,st] of [["localStorage",jar],["sessionStorage",{}]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const row=(w,c)=>[...w.document.getElementById("rows").children]
  .find(b=>b.querySelector(".row-code").textContent===c);
const tap=(w,c)=>row(w,c).dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
const segs=(w,i)=>[...w.document.getElementById("rates").children[i].querySelectorAll(".seg")];

console.log("\n== 1. default bed / wake ==");
let c=open({});
ok(c.w.document.getElementById("bed").value==="21:00","bed shows 21:00 before anything is logged");
ok(c.w.document.getElementById("wake").value==="04:00","wake shows 04:00");
ok(c.w.document.getElementById("times").classList.contains("assumed"),"marked assumed");
ok(c.w.document.getElementById("spanLabel").textContent==="Assumed",'label reads "Assumed", not "In Bed"');
ok(c.w.document.getElementById("span").textContent==="7h 00m","span computes from the defaults");
ok(Object.keys(JSON.parse(c.jar["dailyReadout.v1"]||"{}")).length===0,
   "but no DAY is created for one you only looked at: "+(c.jar["dailyReadout.v1"]||"none"));

tap(c.w,"VIT");
let d=JSON.parse(c.jar["dailyReadout.v1"])[TODAY];
ok(d.bed==="21:00"&&d.wake==="04:00","logging something applies the usual night");
ok(d._df===1,"and flags it as assumed rather than measured");

const bed=c.w.document.getElementById("bed");
bed.value="22:15"; bed.dispatchEvent(new c.w.Event("change",{bubbles:true}));
d=JSON.parse(c.jar["dailyReadout.v1"])[TODAY];
ok(d.bed==="22:15","editing it saves the real time");
ok(d._df===undefined,"and clears the assumed flag");
ok(!c.w.document.getElementById("times").classList.contains("assumed"),"styling follows");
ok(c.w.document.getElementById("spanLabel").textContent==="In Bed",'label returns to "In Bed"');

c=open({}); const wk=c.w.document.getElementById("wake");
wk.value="05:30"; wk.dispatchEvent(new c.w.Event("change",{bubbles:true}));
d=JSON.parse(c.jar["dailyReadout.v1"])[TODAY];
ok(d.wake==="05:30"&&d.bed===undefined,"setting only wake does not invent a bed time");

console.log("\n== 2. the 8-step scale ==");
c=open({});
const labels=segs(c.w,0).map(b=>b.textContent);
ok(labels.join(",")==="1,2,2.5,3,3.5,4,4.5,5","eight steps, exactly as asked: "+labels.join(","));
ok(c.w.document.getElementById("rates").children.length===5,"all four energy points plus productivity");
segs(c.w,0)[2].dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));   // 2.5
d=JSON.parse(c.jar["dailyReadout.v1"])[TODAY];
ok(d.ePre===2.5,"a half point stores as 2.5, not rounded");
const on=segs(c.w,0).map(b=>b.classList.contains("on"));
ok(JSON.stringify(on)==="[true,true,true,false,false,false,false,false]","fills by position, not by value");
segs(c.w,0)[2].dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(JSON.parse(c.jar["dailyReadout.v1"])[TODAY]?.ePre===undefined,"tapping the same step clears it");
segs(c.w,4)[7].dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));   // work = 5
ok(JSON.parse(c.jar["dailyReadout.v1"])[TODAY].work===5,"productivity uses the same scale");

c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{ePre:4,_t:1}})});
ok(segs(c.w,0).filter(b=>b.classList.contains("on")).length===6,"an old 1-5 entry still lands on the scale (4 -> 6 lit)");
ok(/ENG/.test(c.w.document.getElementById("chips").textContent),"summary chip still renders");

console.log("\n== 3. a missed day is red ==");
const jar={"dailyReadout.v1":JSON.stringify({
  [back(2)]:{vitamins:true,keto:true,_t:1},        // logged, vitamins done
  [back(1)]:{keto:true,_t:1},                      // logged, vitamins MISSED
})};                                               // back(3) never logged
c=open(jar);
const grid=c.w.document.getElementById("grid");
const cell=k=>grid.querySelector('.sq[data-d="'+k+'"][title^="VIT"]');
ok(cell(back(2)).classList.contains("on"),"a done day stays teal");
ok(cell(back(1)).classList.contains("gap"),"a logged day where it was missed is red");
ok(cell(back(1)).getAttribute("title").indexOf("missed")>0,"and says so on hover");
ok(!cell(back(3)).classList.contains("gap"),"a day you never logged is NOT red");
ok(!cell(back(3)).classList.contains("on"),"it stays blank");
const sau=k=>grid.querySelector('.sq[data-d="'+k+'"][title^="SAU"]');
const offDay=[back(1),back(2),back(3),back(4),back(5),back(6)]
  .find(k=>sau(k)&&sau(k).classList.contains("na"));
ok(!!offDay,"a day off the schedule is still ghosted, never red");
ok(/Missed/.test(c.w.document.querySelector(".legend").textContent),"legend explains the colour");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
