const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
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
const rows=w=>[...w.document.getElementById("rates").children];
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};
const type=(w,el,v)=>{el.value=v; el.dispatchEvent(new w.Event("input",{bubbles:true}));};

console.log("\n-- condensed headers --");
let c=open({});
const names=rows(c.w).map(r=>r.querySelector(".rate-name").textContent);
ok(names[0]==="Energy: Pre-Work AM","one line: "+JSON.stringify(names[0]));
ok(names.join(" | ")==="Energy: Pre-Work AM | Energy: Work AM | Energy: Work PM | Energy: Post Work | Work Productivity",
   "all five read as one line each");
ok(rows(c.w).every(r=>!r.querySelector(".row-sub")),"the second line is gone entirely");
const mood=[...c.w.document.getElementById("choices").children].map(r=>r.querySelector(".rate-name").textContent);
ok(mood.join("|")==="Mood|Verbal Fluency","mood and fluency untouched");

console.log("\n-- Mood and Verbal Fluency are the same kind of control --");
const choiceRow = n => [...c.w.document.getElementById("choices").children][n];
const pillsOf = r => [...r.querySelectorAll(".pill")];
const moodPills = pillsOf(choiceRow(0)), fluPills = pillsOf(choiceRow(1));
ok(moodPills.length === 3, "Mood offers the three ratings: " + moodPills.map(b => b.textContent).join(","));
ok(fluPills.length === 4, "Fluency offers those plus N/A: " + fluPills.map(b => b.textContent).join(","));
// the rating pills must carry the same classes, so they inherit one style
const cls = b => b.className.split(/\s+/).sort().join(" ");
ok(moodPills.every(b => cls(b) === "pill"), "Mood's are plain pills: " + cls(moodPills[0]));
ok(fluPills.every(b => cls(b) === "pill"),
   "and Fluency's are the same, with no font or colour override of its own: " + cls(fluPills[0]));
ok(cls(fluPills[3]) === "pill", "its N/A included -- it is one of the choices, not an aside");
ok(!/\.pill\.flu/.test(HTML), "and the old segmented-scale styling is gone from the stylesheet");
// selecting paints them the same way too
fluPills[2].dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
moodPills[2].dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
ok(cls(fluPills[2]) === cls(moodPills[2]),
   "picked, they still match: " + cls(fluPills[2]) + " vs " + cls(moodPills[2]));

console.log("\n-- a note per rating --");
ok(rows(c.w).every(r=>r.querySelector(".ratenote")),"every rating row has one");
const n0=rows(c.w)[0].querySelector(".ratenote");
ok(n0.placeholder==="Optional note","placeholder says it is optional");
ok(n0.getAttribute("aria-label")==="Energy: Pre-Work AM: note","labelled for screen readers");
ok(rows(c.w)[0].children[2]===n0,"it sits under the scale, after the header and steps");

console.log("\n-- typing --");
type(c.w,n0,"skipped breakfast, dragged until 10");
ok(store(c).ePreNote==="skipped breakfast, dragged until 10","the note is stored against that rating");
ok(store(c).ePre===undefined,"and the score is untouched — a note alone is allowed");
type(c.w,n0,"   ");
ok(store(c).ePreNote===undefined,"whitespace alone clears it rather than storing blanks");
type(c.w,n0,"back again");
const segs=[...rows(c.w)[0].querySelectorAll(".seg:not(.na-seg)")];
segs[3].dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
ok(store(c).ePre===3&&store(c).ePreNote==="back again","score and note coexist");
ok(rows(c.w)[0].querySelector(".ratenote").value==="back again","a re-render keeps the text on screen");

console.log("\n-- each row is independent --");
type(c.w,rows(c.w)[4].querySelector(".ratenote"),"half day, meetings only");
ok(store(c).workNote==="half day, meetings only","productivity has its own note");
ok(store(c).ePreNote==="back again","without disturbing the others");

console.log("\n-- notes do not leak into the numbers --");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"grid clean");
const chips=c.w.document.getElementById("chips").textContent;
ok(!/back again|half day/.test(chips),"notes stay out of the summary chips");

console.log("\n-- reopening the day --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{ePre:4,ePreNote:"slept badly",workNote:"travel",_t:1}})});
ok(rows(c.w)[0].querySelector(".ratenote").value==="slept badly","the note comes back with the day");
ok(rows(c.w)[4].querySelector(".ratenote").value==="travel","so does the productivity one");
ok(rows(c.w)[1].querySelector(".ratenote").value==="","and rows without a note stay empty");

console.log("\n-- the export --");
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  const head=copied.split("\n")[0];
  ok(/Energy: Pre-Work AM Note/.test(head),"a Note column per rating");
  ok((head.match(/Note/g)||[]).length>=5,"five of them");
  const line=copied.split("\n").find(l=>l.indexOf(TODAY)===0)||"";
  ok(/slept badly/.test(line)&&/travel/.test(line),"and the text is in the row");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
