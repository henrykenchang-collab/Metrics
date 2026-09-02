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

const click=(w,el)=>el.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
const wraps=w=>[...w.document.querySelectorAll("#meals .mealwrap")];
const foodBtn=(w,i)=>wraps(w)[i].querySelector(".foodsel");
const pop=(w,i)=>wraps(w)[i].querySelector(".foodpop");
const box=(w,i,food)=>[...pop(w,i).querySelectorAll(".foodopt")]
  .find(l=>l.querySelector("input").value===food).querySelector("input");
const other=(w,i)=>pop(w,i).querySelector(".mealother");
const check=(w,i,food)=>click(w,box(w,i,food));

console.log("\n-- Meals --");
c=open({});
ok(!!c.w.document.getElementById("meals"),"the section exists");
ok(c.w.document.getElementById("meals").children.length===0,"empty to begin with");
ok(!!c.w.document.getElementById("mealAdd"),"with an Add Meal button");
c.w.document.getElementById("mealAdd").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
let row=wraps(c.w)[0];
ok(!!row,"adding gives a row");
ok([...row.querySelectorAll("option")].map(o=>o.value).join(",")==="Breakfast,Lunch,Dinner","the dropdown offers the three meals");
ok(row.querySelector(".mealsel").value==="Breakfast","first row defaults to Breakfast");
ok(!!row.querySelector(".foodsel"),"with a food picker beside it, not a free-form field");
ok(!c.w.document.querySelector(".mealtext"),"the old free-form field is gone");
ok(Object.keys(JSON.parse(c.jar["dailyReadout.v1"]||"{}")).length===0,
   "an empty row does not conjure a day into existence");

console.log("\n-- the picker itself --");
// Add Meal opens the new row's picker right away, same spirit as the old
// version focusing the text field -- so this checks the state adding leaves
// it in, not a bare "closed by default"
ok(pop(c.w,0).hidden===false,"adding a meal opens its picker, ready to use");
ok(foodBtn(c.w,0).getAttribute("aria-expanded")==="true","and the button says so");
ok([...pop(c.w,0).querySelectorAll(".foodopt span")].map(s=>s.textContent).join(",")===
   "Steak,Ground Beef,Ground Bison,Avocado,Fried Eggs,Fruits,Other (Free Form)",
   "offers the seven options, Other last");
ok(other(c.w,0).hidden===true,"the free-form field stays hidden until Other is picked");
click(c.w,foodBtn(c.w,0));
ok(pop(c.w,0).hidden===true,"the same button closes it again");
ok(foodBtn(c.w,0).getAttribute("aria-expanded")==="false","and says so");
click(c.w,foodBtn(c.w,0));
ok(pop(c.w,0).hidden===false,"and opens it right back up");

console.log("\n-- picking more than one --");
check(c.w,0,"Steak");
ok(day(c).meals[0].foods.join(",")==="Steak","checking Steak records it");
ok(foodBtn(c.w,0).textContent==="Steak","and shows on the button");
check(c.w,0,"Avocado");
ok(day(c).meals[0].foods.join(",")==="Steak,Avocado","a second pick adds, not replaces");
ok(foodBtn(c.w,0).textContent==="Steak, Avocado","both read on the button");
check(c.w,0,"Steak");
ok(day(c).meals[0].foods.join(",")==="Avocado","unchecking drops just that one");
ok(day(c).meals[0].m==="Breakfast","all the while against the chosen meal");

console.log("\n-- Other reveals a field of its own --");
check(c.w,0,"Other (Free Form)");
ok(other(c.w,0).hidden===false,"checking Other opens the free-form field");
type(c.w,other(c.w,0),"black coffee");
ok(day(c).meals[0].other==="black coffee","typed text is kept separately");
ok(foodBtn(c.w,0).textContent==="Avocado, black coffee","and reads on the button in Other's place");
check(c.w,0,"Other (Free Form)");
ok(other(c.w,0).hidden===true,"unchecking Other hides the field again");
ok(day(c).meals[0].foods.indexOf("Other (Free Form)")===-1,"and drops it from the picked list");
ok(day(c).meals[0].other==="black coffee","though the typed text itself is left alone, just unused");

console.log("\n-- a second meal --");
c.w.document.getElementById("mealAdd").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(wraps(c.w)[1].querySelector(".mealsel").value==="Lunch","the second row offers Lunch next");
check(c.w,1,"Ground Bison");
ok(day(c).meals.length===2&&day(c).meals[1].foods.join(",")==="Ground Bison","two meals held independently");

const sel=wraps(c.w)[1].querySelector(".mealsel");
sel.value="Dinner"; sel.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(day(c).meals[1].m==="Dinner","changing the dropdown re-files it");

console.log("\n-- a custom category, added on the fly --");
const addBtn=(w,i)=>pop(w,i).querySelector(".foodadd");
const addForm=(w,i)=>pop(w,i).querySelector(".foodaddform");
const addInput=(w,i)=>pop(w,i).querySelector(".foodaddinput");
ok(!!addBtn(c.w,0),"a + Add control sits in the picker");
ok(addForm(c.w,0).hidden===true,"its form starts closed");
click(c.w,addBtn(c.w,0));
ok(addForm(c.w,0).hidden===false,"opens on click");
type(c.w,addInput(c.w,0),"Chicken");
click(c.w,pop(c.w,0).querySelector(".foodaddsave"));
ok(JSON.parse(c.jar["dailyReadout.customFoods"]||"[]").indexOf("Chicken")>=0,
   "the new category joins a synced list, like a custom Factor tag");
ok(day(c).meals[0].foods.indexOf("Chicken")>=0,"and is checked immediately for the row it was typed in");
ok(box(c.w,0,"Chicken").checked===true,"the checkbox itself reads checked too");
ok(pop(c.w,0).hidden===false,"that row's picker reopens rather than just closing on you");

console.log("\n-- it is offered everywhere, not just the row it was typed in --");
ok(!!box(c.w,1,"Chicken"),"the other, already-open row picked it up too");
ok(box(c.w,1,"Chicken").checked===false,"unchecked there -- only the row it was added from got it");
ok([...pop(c.w,0).querySelectorAll(".foodopt span")].map(s=>s.textContent).slice(-2).join(",")==="Chicken,Other (Free Form)",
   "a custom category lands right before Other, after the built-ins");

console.log("\n-- typing an existing name again does not duplicate it --");
click(c.w,addBtn(c.w,1));
type(c.w,addInput(c.w,1),"chicken");                    // different case on purpose
click(c.w,pop(c.w,1).querySelector(".foodaddsave"));
ok(JSON.parse(c.jar["dailyReadout.customFoods"]).filter(f=>f==="Chicken").length===1,
   "case-insensitive match reuses the one already added, rather than adding a near-duplicate");
ok(day(c).meals[1].foods.indexOf("Chicken")>=0,"and still checks the canonical spelling for this row");
ok([...pop(c.w,1).querySelectorAll(".foodopt span")].filter(s=>s.textContent==="Chicken").length===1,
   "only one Chicken pill, not two");

console.log("\n-- it survives a reload, and rides in the seed --");
{
  const again=open(c.jar);
  // Add Meal opens the new row's picker itself; no need to click it open
  again.w.document.getElementById("mealAdd").dispatchEvent(new again.w.MouseEvent("click",{bubbles:true}));
  const lastIdx=wraps(again.w).length-1;
  ok(!!box(again.w,lastIdx,"Chicken"),"Chicken is offered on a fresh load too, from the synced list");
  const seedHTML='<script type="application/json" id="seed">'+
    JSON.stringify({v:1,days:{},tags:[],customFoods:["Raw Eggs"],vitInfo:{}})+
    "</script>"+HTML;
  const w2=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+seedHTML+"</body></html>",
    {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
     beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
      const jar={};
      for(const n of ["localStorage","sessionStorage"])
       Object.defineProperty(w,n,{value:{getItem:k=>(k in jar?jar[k]:null),
        setItem:(k,v)=>{jar[k]=String(v);},removeItem:k=>{delete jar[k];}},configurable:true});}}).window;
  w2.document.getElementById("mealAdd").dispatchEvent(new w2.MouseEvent("click",{bubbles:true}));
  ok(!!box(w2,0,"Raw Eggs"),"and a category seeded from a published copy is offered too");
}

console.log("\n-- removing --");
wraps(c.w)[0].querySelector(".mealdel").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(day(c).meals.length===1&&day(c).meals[0].foods.join(",")==="Ground Bison,Chicken","the right row is removed");
wraps(c.w)[0].querySelector(".mealdel").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(day(c).meals===undefined,"removing the last one drops the key");

console.log("\n-- Other's text is text, not markup --");
c=open({});
c.w.document.getElementById("mealAdd").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
check(c.w,0,"Other (Free Form)");
type(c.w,other(c.w,0),'<img src=x onerror=alert(1)> & "quotes"');
ok(day(c).meals[0].other.indexOf("<img")===0,"stored verbatim");
ok(c.w.document.querySelectorAll("#meals img").length===0,"and never becomes an element");

console.log("\n-- it reopens with the day --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{meals:[{m:"Dinner",foods:["Steak","Other (Free Form)"],other:"and a baked potato"}],vitamins:true,_t:1}})});
ok(c.w.document.querySelectorAll("#meals .mealrow").length===1,"the row comes back");
ok(pop(c.w,0).hidden===true,"its picker starts closed, unlike a freshly added row");
ok(foodBtn(c.w,0).textContent==="Steak, and a baked potato","with its foods and Other text");
ok(wraps(c.w)[0].querySelector(".mealsel").value==="Dinner","and its meal");
click(c.w,foodBtn(c.w,0));
ok(other(c.w,0).hidden===false,"opening it shows Other's field, since it was picked");
ok(other(c.w,0).value==="and a baked potato","carrying the saved text");

console.log("\n-- a meal typed before the picker existed still reads, through Other --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{meals:[{m:"Lunch",t:"chicken salad"}],vitamins:true,_t:1}})});
ok(day(c).meals[0].t===undefined,"migrated away on load");
ok(day(c).meals[0].foods.join(",")==="Other (Free Form)","filed under Other");
ok(day(c).meals[0].other==="chicken salad","carrying the original text verbatim");
ok(foodBtn(c.w,0).textContent==="chicken salad","and it still just reads as itself on the button");

console.log("\n-- the export --");
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  ok(/Meals/.test(copied.split("\n")[0]),"a Meals column");
  ok(/Lunch: chicken salad/.test(copied),"holding meal and text: ");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
