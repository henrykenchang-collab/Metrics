const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const back=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
const TODAY=iso(new Date());
function open(jar){jar=jar||{};
  const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     for(const[n,st]of[["localStorage",jar],["sessionStorage",{}]])
      Object.defineProperty(w,n,{value:{getItem:k=>(k in st?st[k]:null),
       setItem:(k,v)=>{st[k]=String(v);},removeItem:k=>{delete st[k];}},configurable:true});}}).window;
  return {w,jar};
}
const store=c=>JSON.parse(c.jar["dailyReadout.v1"]||"{}")[TODAY]||{};

console.log("\n-- N/A in the month grid --");
let c=open({"dailyReadout.v1":JSON.stringify({
  [back(3)]:{work:4,vitamins:true,_t:1},                                  // scored
  [back(2)]:{work:"na",ePre:"na",eAM:"na",ePM:"na",ePost:"na",vitamins:true,_t:1},
  [back(1)]:{vitamins:true,_t:1}})});                                     // logged, work left blank
const cell=(k,code)=>c.w.document.getElementById("grid")
  .querySelector('.sq[data-d="'+k+'"][title^="'+code+'"]');
ok(cell(back(2),"WRK").classList.contains("napp"),"an N/A work day gets its own class");
ok(cell(back(2),"WRK").textContent==="N/A",'and reads "N/A" inside the square');
ok(cell(back(2),"ENG").textContent==="N/A","energy too, when every point is N/A");
ok(cell(back(3),"WRK").classList.contains("c")&&cell(back(3),"WRK").textContent==="",
   "a scored day stays a plain copper square");
ok(cell(back(1),"WRK").textContent===""&&!cell(back(1),"WRK").classList.contains("napp"),
   "a blank rating stays blank — silence is not N/A");

console.log("\n-- it is distinct from the other three states --");
const sau=[...c.w.document.getElementById("grid").querySelectorAll('.sq[title^="SAU"]')];
ok(sau.some(x=>x.classList.contains("na")),"off-schedule days still use the ghost");
ok(sau.every(x=>!x.classList.contains("napp")),"and never the N/A treatment");
ok(!cell(back(2),"WRK").classList.contains("na"),"N/A is not the ghost either");
const vit=cell(back(2),"VIT");
ok(vit.classList.contains("on"),"markers unaffected");

console.log("\n-- styling --");
const css=HTML.replace(/\s+/g," ");
ok(/\.sq\.napp \{[^}]*background: var\(--ink\)/.test(css),"painted with the strongest ink token");
ok(/\.sq\.napp \{[^}]*color: var\(--surface\)/.test(css),"letters take the opposite token, so they stay legible");
ok(/\.sq\.napp \{[^}]*font-size: 6px/.test(css),"small letters, as asked");
ok(/N\/A/.test(c.w.document.querySelector(".legend").textContent),"legend explains it");
ok(!/#000|black/.test(css.match(/\.sq\.napp \{[^}]*\}/)[0]),
   "no literal black, which would vanish on the dark theme");

console.log("\n-- IR Supply condensed --");
c=open({});
const sup=c.w.document.getElementById("supply");
ok(sup.classList.contains("doses"),"it uses the same one-line rows as Extra IR/XR");
ok(sup.classList.contains("tight"),"without a second rule under the panel head");
ok(sup.querySelectorAll(".doserow").length===1,"one row now that Taken Today is gone");
const names=[...sup.querySelectorAll(".dose-name")].map(e=>e.textContent);
ok(names.join(" | ")==="Refill Date:","just the date: "+names.join(" | "));
ok(sup.querySelectorAll(".dosein").length===0,"no number field left here");
ok(sup.querySelectorAll(".datein").length===1,"and one date field");
ok(/Refill Date/.test(c.w.document.getElementById("packBody").textContent),
   "the empty state points at it");

console.log("\n-- and still works --");
const when=sup.querySelector(".datein");
when.value="2026-08-20"; when.dispatchEvent(new c.w.Event("change",{bubbles:true}));
ok(store(c).refill==="2026-08-20","the date records");
ok(c.w.document.getElementById("packHead").textContent.indexOf("Refilled")===0,"the panel reads");
ok(/Supply Left/.test(c.w.document.getElementById("packBody").textContent),"and the bars render");
ok(c.w.document.getElementById("extras").querySelectorAll(".doserow").length===2,"Extra/Under rows unchanged");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
