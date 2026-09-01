const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
/* The month grid shows one month, so days seeded a few back have to land
   inside it. For most of the month "today" does that; on the 1st it does
   not, and yesterday has no square to be looked up in. Near the boundary
   the clock steps back into the previous month instead, and the page is
   told the same time, so these stay tests of the grid rather than of the
   date they happen to run on. */
const NOW=(()=>{const d=new Date();
  if(d.getDate()<=7){d.setDate(0);d.setDate(20);}   // the 20th of the month before
  return d;})();
const back=n=>{const d=new Date(NOW);d.setDate(d.getDate()-n);return iso(d);};
const TODAY=iso(NOW);
// a recent Saturday and a recent weekday, for the weekend rule
const satBack=(()=>{for(let i=0;i<8;i++){const d=new Date(NOW);d.setDate(d.getDate()-i);if(d.getDay()===6)return i;}})();
const wedBack=(()=>{for(let i=0;i<8;i++){const d=new Date(NOW);d.setDate(d.getDate()-i);if(d.getDay()===3)return i;}})();
let copied="";
function open(jar,sess){jar=jar||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     const R=w.Date,f=TODAY+"T12:00:00";
     function F(...a){return a.length?new R(...a):new R(f);}
     F.prototype=R.prototype;F.now=()=>new R(f).getTime();F.parse=R.parse;F.UTC=R.UTC;w.Date=F;
     Object.defineProperty(w.navigator,"clipboard",{value:{writeText:t=>{copied=t;return Promise.resolve();}},configurable:true});
     for(const[n,st]of[["localStorage",jar],["sessionStorage",sess||{}]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const day=(c,k)=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[k||TODAY]||{};
const onDay=(c,k)=>open(c.jar,{"dailyReadout.cur":JSON.stringify({d:k,on:TODAY})});
const type=(w,el,v)=>{el.value=v; el.dispatchEvent(new w.Event("input",{bubbles:true}));};

console.log("\n-- CPAP zero is red --");
let c=open({"dailyReadout.v1":JSON.stringify({
  [back(3)]:{cpap:0,vitamins:true,_t:1},
  [back(2)]:{cpap:83,vitamins:true,_t:1},
  [back(1)]:{vitamins:true,_t:1}})});
const cell=(k)=>c.w.document.getElementById("grid").querySelector('.sq[data-d="'+k+'"][title^="CPAP"]');
ok(cell(back(3)).classList.contains("gap"),"a zero draws in the missed red");
ok(/missed/.test(cell(back(3)).getAttribute("title")),"and says so on hover: "+cell(back(3)).getAttribute("title"));
ok(cell(back(2)).classList.contains("v")&&!cell(back(2)).classList.contains("gap"),"83 stays violet");
ok(!cell(back(1)).classList.contains("gap"),"a day with no CPAP entry is not red");
const sums=[...c.w.document.getElementById("grid").querySelectorAll(".grid-sum")].map(e=>e.textContent);
ok(sums.some(t=>t==="42"),"the zero still counts in the monthly average (0 and 83 -> 42): "+sums.filter(Boolean).slice(-4));

console.log("\n-- weekends default Work Productivity to N/A --");
c=onDay(open({}),back(satBack));
const wrk=c.w.document.getElementById("rates").children[4];
ok(wrk.querySelector(".rate-name").textContent==="Work Productivity","row 5 is productivity");
ok(wrk.querySelector(".na-seg").classList.contains("on"),"N/A is lit on a Saturday");
ok([...wrk.querySelectorAll(".seg:not(.na-seg)")].every(b=>!b.classList.contains("on")),"no score is lit with it");
c=onDay(open({}),back(wedBack));
ok(!c.w.document.getElementById("rates").children[4].querySelector(".na-seg").classList.contains("on"),
   "a Wednesday starts blank, not N/A");

c=onDay(open({}),back(satBack));
[...c.w.document.getElementById("rows").children][0].dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(day(c,back(satBack)).work==="na","logging anything on a Saturday commits the N/A");
const scored=onDay(open(c.jar),back(satBack));
const seg=[...scored.w.document.getElementById("rates").children[4].querySelectorAll(".seg:not(.na-seg)")][7];
seg.dispatchEvent(new scored.w.MouseEvent("click",{bubbles:true}));
ok(day(scored,back(satBack)).work===5,"but a score you tap overrides it");

console.log("\n-- Meals --");
c=open({});
ok(!!c.w.document.getElementById("meals"),"the section exists");
ok(c.w.document.getElementById("meals").children.length===0,"empty to begin with");
ok(!!c.w.document.getElementById("mealAdd"),"with an Add Meal button");
c.w.document.getElementById("mealAdd").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
let row=c.w.document.getElementById("meals").children[0];
ok(!!row,"adding gives a row");
ok([...row.querySelectorAll("option")].map(o=>o.value).join(",")==="Breakfast,Lunch,Dinner","the dropdown offers the three meals");
ok(row.querySelector(".mealsel").value==="Breakfast","first row defaults to Breakfast");
ok(!!row.querySelector(".mealtext"),"with a free-form field beside it");
ok(Object.keys(JSON.parse(c.jar["dailyReadout.v1"]||"{}")).length===0,
   "an empty row does not conjure a day into existence");

type(c.w,row.querySelector(".mealtext"),"eggs, avocado, black coffee");
ok(day(c).meals[0].t==="eggs, avocado, black coffee","typing records it");
ok(day(c).meals[0].m==="Breakfast","against the chosen meal");

c.w.document.getElementById("mealAdd").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
let row2=c.w.document.getElementById("meals").children[1];
ok(row2.querySelector(".mealsel").value==="Lunch","the second row offers Lunch next");
type(c.w,row2.querySelector(".mealtext"),"chicken salad");
ok(day(c).meals.length===2&&day(c).meals[1].t==="chicken salad","two meals held independently");

const sel=row2.querySelector(".mealsel");
sel.value="Dinner"; sel.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(day(c).meals[1].m==="Dinner","changing the dropdown re-files it");

console.log("\n-- removing --");
c.w.document.getElementById("meals").children[0].querySelector(".mealdel")
  .dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(day(c).meals.length===1&&day(c).meals[0].t==="chicken salad","the right row is removed");
c.w.document.getElementById("meals").children[0].querySelector(".mealdel")
  .dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(day(c).meals===undefined,"removing the last one drops the key");

console.log("\n-- text is text, not markup --");
c=open({});
c.w.document.getElementById("mealAdd").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
type(c.w,c.w.document.querySelector(".mealtext"),'<img src=x onerror=alert(1)> & "quotes"');
ok(day(c).meals[0].t.indexOf("<img")===0,"stored verbatim");
ok(c.w.document.querySelectorAll("#meals img").length===0,"and never becomes an element");

console.log("\n-- it reopens with the day --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{meals:[{m:"Dinner",t:"steak"}],vitamins:true,_t:1}})});
ok(c.w.document.querySelectorAll("#meals .mealrow").length===1,"the row comes back");
ok(c.w.document.querySelector(".mealtext").value==="steak","with its text");
ok(c.w.document.querySelector(".mealsel").value==="Dinner","and its meal");

console.log("\n-- the export --");
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  ok(/Meals/.test(copied.split("\n")[0]),"a Meals column");
  ok(/Dinner: steak/.test(copied),"holding meal and text: ");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
