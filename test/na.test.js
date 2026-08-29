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
const path=c.w.document.getElementById("curve").innerHTML;
ok(!/NaN/.test(path),"the energy curve has no NaN in it");
ok((path.match(/<circle/g)||[]).length===4,"and still plots all four points");

console.log("\n-- the month grid ghosts it --");
c=open({"dailyReadout.v1":JSON.stringify({
  [back(2)]:{work:4,_t:1},
  [back(1)]:{work:"na",ePre:"na",eAM:"na",ePM:"na",ePost:"na",_t:1}})});
const cell=(k,code)=>c.w.document.getElementById("grid")
  .querySelector('.sq[data-d="'+k+'"][title^="'+code+'"]');
ok(cell(back(2),"WRK").classList.contains("c"),"a scored day is still copper");
ok(cell(back(1),"WRK").classList.contains("na"),"an N/A day is ghosted, not blank and not red");
ok(/not applicable/.test(cell(back(1),"WRK").getAttribute("title")),"and says so on hover");
ok(cell(back(1),"ENG").classList.contains("na"),"energy ghosts too when every point is N/A");
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
