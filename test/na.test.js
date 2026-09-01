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
let copied="";
function open(jar){jar=jar||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     const R=w.Date,f=TODAY+"T12:00:00";
     function F(...a){return a.length?new R(...a):new R(f);}
     F.prototype=R.prototype;F.now=()=>new R(f).getTime();F.parse=R.parse;F.UTC=R.UTC;w.Date=F;
     Object.defineProperty(w.navigator,"clipboard",{value:{writeText:t=>{copied=t;return Promise.resolve();}},configurable:true});
     for(const[n,st]of[["localStorage",jar],["sessionStorage",{}]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const rowOf=(w,i)=>w.document.getElementById("rates").children[i];
const na=(w,i)=>rowOf(w,i).querySelector(".na-seg");
const nums=(w,i)=>[...rowOf(w,i).querySelectorAll(".seg:not(.na-seg)")];
const click=(w,el)=>el.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};

console.log("\n-- the control --");
let c=open({});
ok(w=>true,"");
ok([...c.w.document.getElementById("rates").children].every(r=>r.querySelector(".na-seg")),
   "every rating row has an N/A, all five of them");
ok(na(c.w,0).textContent==="N/A","labelled N/A");
ok(nums(c.w,0).length===8,"the eight steps are still there beside it");

console.log("\n-- choosing it --");
click(c.w,na(c.w,0));
ok(store(c).ePre==="na",'stores the string "na", never a number');
ok(na(c.w,0).classList.contains("on"),"the button lights");
ok(nums(c.w,0).every(b=>!b.classList.contains("on")),"and no step lights with it");
click(c.w,na(c.w,0));
ok(store(c).ePre===undefined,"tapping it again clears back to blank");
click(c.w,na(c.w,0)); click(c.w,nums(c.w,0)[3]);           // N/A then 3
ok(store(c).ePre===3,"choosing a score replaces N/A");
ok(!na(c.w,0).classList.contains("on"),"and unlights it");

console.log("\n-- it stays out of the arithmetic --");
c=open({});
click(c.w,nums(c.w,0)[7]);            // ePre = 5
click(c.w,na(c.w,1));                 // eAM  = N/A
click(c.w,nums(c.w,2)[0]);            // ePM  = 1
ok(store(c).eAM==="na","one point marked N/A");
const chips=c.w.document.getElementById("chips").textContent;
ok(/ENG3\.0|ENG.*3/.test(chips.replace(/\s/g,"")),"energy averages 5 and 1 to 3.0, ignoring the N/A: "+chips.replace(/\s+/g," ").trim());
click(c.w,na(c.w,4));                 // work = N/A
ok(!/WRK/.test(c.w.document.getElementById("chips").textContent),'no "na/5" chip for work');

console.log("\n-- Work Productivity has its own steps --");
{
  const w = open({}).w;
  const stepsOf = i => [...w.document.getElementById("rates").children[i]
    .querySelectorAll(".seg:not(.na-seg)")].map(b => b.textContent);
  const energy = stepsOf(0), work = stepsOf(4);
  ok(energy.join(",") === "1,2,2.5,3,3.5,4,4.5,5", "Energy keeps the original scale: " + energy.join(","));
  ok(work.join(",") === "1,1.5,2,2.5,3,4,4.5,5", "Work Productivity gains 1.5 and drops 3.5: " + work.join(","));
  ok(work.length === energy.length, "same number of steps, so the row is the same width");
  // the four Energy rows must not have been dragged along with it
  [0, 1, 2, 3].forEach(i => ok(stepsOf(i).indexOf("3.5") >= 0 && stepsOf(i).indexOf("1.5") < 0,
    "Energy row " + i + " is untouched: " + stepsOf(i).join(",")));
}
{
  // picking 1.5 records the number, and fills by position not by value
  const c2 = open({});
  const workRow = c2.w.document.getElementById("rates").children[4];
  const steps = [...workRow.querySelectorAll(".seg:not(.na-seg)")];
  steps[1].dispatchEvent(new c2.w.MouseEvent("click", { bubbles: true }));
  ok(JSON.parse(c2.jar["dailyReadout.v1"])[TODAY].work === 1.5,
     "1.5 is stored as the number 1.5: " + JSON.stringify(JSON.parse(c2.jar["dailyReadout.v1"])[TODAY].work));
  ok(steps[0].classList.contains("on") && steps[1].classList.contains("on") && !steps[2].classList.contains("on"),
     "and fills up to it, no further");
}
{
  // a day already carrying 3.5 keeps the number -- it just has no step to sit
  // on, which is why this went to Work Productivity alone
  const kept = open({ "dailyReadout.v1": JSON.stringify({ [TODAY]: { work: 3.5, _t: 1 } }) });
  ok(JSON.parse(kept.jar["dailyReadout.v1"])[TODAY].work === 3.5, "history is not rewritten");
  const lit = [...kept.w.document.getElementById("rates").children[4]
    .querySelectorAll(".seg.on")].length;
  ok(lit === 0, "it simply reads as unrated on screen: " + lit + " steps lit");
}

console.log("\n-- the month grid ghosts it --");
c=open({"dailyReadout.v1":JSON.stringify({
  [back(2)]:{work:4,_t:1},
  [back(1)]:{work:"na",ePre:"na",eAM:"na",ePM:"na",ePost:"na",_t:1}})});
const cell=(k,code)=>c.w.document.getElementById("grid")
  .querySelector('.sq[data-d="'+k+'"][title^="'+code+'"]');
ok(cell(back(2),"WRK").classList.contains("c"),"a scored day is still copper");
ok(cell(back(1),"WRK").classList.contains("napp"),"an N/A day gets the N/A treatment, not blank and not red");
ok(/not applicable/.test(cell(back(1),"WRK").getAttribute("title")),"and says so on hover");
ok(cell(back(1),"ENG").classList.contains("napp"),"energy marks N/A too when every point is N/A");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"no NaN anywhere in the grid");
const sums=[...c.w.document.getElementById("grid").querySelectorAll(".grid-sum")].map(e=>e.textContent);
ok(!sums.some(t=>/NaN/.test(t)),"and the monthly averages are clean: "+sums.filter(Boolean).slice(-6).join(" "));

console.log("\n-- a day of N/A is still a logged day --");
ok(!/Nothing Logged/.test(c.w.document.getElementById("guard").textContent),
   "saying it did not apply counts as having said something");

console.log("\n-- the export keeps the difference --");
click(c.w,c.w.document.getElementById("copyBtn"));
setTimeout(()=>{
  const line=copied.split("\n").find(l=>l.indexOf(back(1))===0)||"";
  ok(/N\/A/.test(line),"N/A exports as N/A, not as an empty cell");
  const blank=copied.split("\n").find(l=>l.indexOf(back(2))===0)||"";
  ok(blank.indexOf(",,")>=0,"a genuinely blank rating still exports empty");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
