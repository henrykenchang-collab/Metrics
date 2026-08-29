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
const stepsIn=w=>w.document.querySelector("#activity .dosein");

console.log("\n-- the field --");
let c=open({});
ok(!!c.w.document.getElementById("activity"),"an Activity panel exists");
const heads=[...c.w.document.querySelectorAll("section.panel .panel-head .code")].map(e=>e.textContent);
ok(heads.join("|").indexOf("Meals|What You Ate|Activity")>=0,"it sits after Meals: "+heads.filter((_,i)=>i%2===0).join(" | "));
ok(!!stepsIn(c.w),"with a Steps field");
ok(c.w.document.querySelector("#activity .dose-name").textContent==="Steps:","labelled Steps");
ok(!c.w.document.querySelector("#activity .dose-unit"),"and no redundant unit after the number");
ok(stepsIn(c.w).maxLength===5,"five digits, not four: "+stepsIn(c.w).maxLength);

console.log("\n-- five-digit counts --");
const type=(w,el,v)=>{el.value=v; el.dispatchEvent(new w.Event("input",{bubbles:true}));};
type(c.w,stepsIn(c.w),"12480");
ok(store(c).steps===12480,"a five-digit count records whole: "+store(c).steps);
type(c.w,stepsIn(c.w),"999999");
ok(stepsIn(c.w).value==="99999","a sixth digit is refused");
type(c.w,stepsIn(c.w),"8432");
ok(store(c).steps===8432,"and a four-digit one is fine");
ok(/STEP8,432/.test(c.w.document.getElementById("chips").textContent.replace(/\s/g,"")),
   "the summary chip groups it: "+c.w.document.getElementById("chips").textContent.trim());

console.log("\n-- the doses did not grow a digit --");
const ir=c.w.document.querySelectorAll("#extras .dosein")[0];
ok(ir.maxLength===4,"Extra/Under IR still stops at four, for -40");
type(c.w,ir,"12345");
ok(ir.value==="123","and still clamps its digits: "+ir.value);

console.log("\n-- the month grid --");
c=open({"dailyReadout.v1":JSON.stringify({
  [back(2)]:{steps:11000,_t:1},[back(1)]:{steps:2000,_t:1}})});
const cell=(k)=>c.w.document.getElementById("grid").querySelector('.sq[data-d="'+k+'"][title^="STEP"]');
ok(!!cell(back(2)),"a STEP row exists");
ok(parseFloat(cell(back(2)).style.opacity)>parseFloat(cell(back(1)).style.opacity),
   "a big day reads darker than a small one");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"grid clean");
const sums=[...c.w.document.getElementById("grid").querySelectorAll(".grid-sum")].map(e=>e.textContent).filter(Boolean);
ok(sums.indexOf("6500")>=0,"the monthly average is a whole number of steps: "+sums.slice(-6).join(" "));

console.log("\n-- a week of walking against the week before --");
const jar={}; const d={};
for(let i=0;i<7;i++)  d[back(i)]   ={steps:4000,_t:1};
for(let i=7;i<14;i++) d[back(i)]   ={steps:9000,_t:1};
jar["dailyReadout.v1"]=JSON.stringify(d);
c=open(jar);
const g=c.w.document.getElementById("guard").textContent.replace(/\s+/g," ");
ok(/Steps/.test(g),"a fall of 5,000 a day is flagged");
ok(/4000|4,000/.test(g),"with the numbers: "+(g.match(/Steps[^.]*\./)||[""])[0].trim());

console.log("\n-- the export --");
c=open({"dailyReadout.v1":JSON.stringify({[TODAY]:{steps:8432,_t:1}})});
c.w.document.getElementById("copyBtn").dispatchEvent(new c.w.MouseEvent("click",{bubbles:true}));
setTimeout(()=>{
  ok(/,Steps,/.test(copied.split("\n")[0]),"a Steps column");
  ok(/8432/.test(copied.split("\n").find(l=>l.indexOf(TODAY)===0)||""),"carrying the count");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
