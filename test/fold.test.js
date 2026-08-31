const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
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
const panels=w=>[...w.document.querySelectorAll("section.panel")];
const head=p=>p.querySelector(".panel-head");
const body=p=>p.querySelector(".panel-body");
const click=(w,el)=>el.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));

console.log("\n-- every section folds --");
let c=open({});
const ps=panels(c.w);
ok(ps.length===9,"nine panels: "+ps.map(p=>head(p).querySelector(".code").textContent).join(" | "));
ok(ps.every(p=>body(p)),"each grew a body wrapper");
ok(ps.every(p=>p.id),"each has an id to remember by");
ok(ps.every(p=>head(p).querySelector(".chev")),"each head has a chevron");
const openAtFirst=ps.filter(p=>p.id!=="vitaminSupply");
ok(openAtFirst.every(p=>head(p).getAttribute("aria-expanded")==="true"),"all open to begin with, bar one");
ok(ps.every(p=>head(p).getAttribute("role")==="button"),"heads announce as buttons");
ok(head(ps[0]).getAttribute("aria-label")==="Journal","and carry their name: "+head(ps[0]).getAttribute("aria-label"));

console.log("\n-- folding --");
click(c.w,head(ps[0]));
ok(body(ps[0]).hidden===true,"the body hides");
ok(head(ps[0]).classList.contains("shut"),"the head marks itself shut");
ok(head(ps[0]).getAttribute("aria-expanded")==="false","and says so");
ok(body(ps[1]).hidden===false,"its neighbour is unaffected");
click(c.w,head(ps[0]));
ok(body(ps[0]).hidden===false,"clicking again opens it");

console.log("\n-- the keyboard --");
head(ps[2]).dispatchEvent(new c.w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
ok(body(ps[2]).hidden===true,"Enter folds");
head(ps[2]).dispatchEvent(new c.w.KeyboardEvent("keydown",{key:" ",bubbles:true}));
ok(body(ps[2]).hidden===false,"Space unfolds");

console.log("\n-- Vitamin Supply starts rolled up --");
{
  const fresh=open({});
  const vit=panels(fresh.w).find(p=>p.id==="vitaminSupply");
  ok(!!vit,"it has a stable id, not a positional one");
  ok(body(vit).hidden===true,"and comes up shut on a log that has never been folded");
  ok(panels(fresh.w).filter(p=>body(p).hidden).length===1,"it is the only one");
  // the default is applied once; after that the choice is the user's
  const vitHead=head(panels(fresh.w).find(p=>p.id==="vitaminSupply"));
  click(fresh.w,vitHead);
  ok(body(panels(fresh.w).find(p=>p.id==="vitaminSupply")).hidden===false,"opening it works");
  const again=open(fresh.jar);
  ok(body(panels(again.w).find(p=>p.id==="vitaminSupply")).hidden===false,
     "and it stays open next load -- the default does not reassert itself");
}
{
  // an existing log that predates the default still gets it, exactly once
  const older=open({"dailyReadout.shut":JSON.stringify([])});
  ok(body(panels(older.w).find(p=>p.id==="vitaminSupply")).hidden===true,
     "a log with fold history but no marker still picks the default up");
}

console.log("\n-- it is remembered, per device --");
click(c.w,head(ps[3])); click(c.w,head(ps[5]));
const stored=JSON.parse(c.jar["dailyReadout.shut"]);
ok(stored.length===3,"the two just folded, plus Vitamin Supply: "+stored.join(", "));
ok(!c.jar["dailyReadout.v1"]||!/shut/.test(c.jar["dailyReadout.v1"]),"and never into the log");
const c2=open(c.jar);
const p2=panels(c2.w);
ok(body(p2[3]).hidden===true&&body(p2[5]).hidden===true,"they come back shut");
ok(body(p2[0]).hidden===false,"the others come back open");

console.log("\n-- the month arrows still step months --");
c=open({});
const mp=panels(c.w).find(p=>p.querySelector("#mprev"));
const before=c.w.document.getElementById("mlabel").textContent;
click(c.w,c.w.document.getElementById("mprev"));
ok(c.w.document.getElementById("mlabel").textContent!==before,
   "prev moved "+before+" -> "+c.w.document.getElementById("mlabel").textContent);
ok(body(mp).hidden===false,"and did NOT fold the panel it sits in");
click(c.w,c.w.document.getElementById("mlabel"));
ok(body(mp).hidden===true,"but the label between them still folds it");

console.log("\n-- folding does not disturb the data --");
c=open({});
const shutAll=panels(c.w); shutAll.forEach(p=>click(c.w,head(p)));
const row=[...c.w.document.getElementById("rows").children][0];
click(c.w,row);
ok(JSON.parse(c.jar["dailyReadout.v1"])[TODAY].vitamins===true,"a marker inside a shut panel still records");
ok(c.w.document.getElementById("scoreN").textContent!=="","the readout above still renders");
ok(!/NaN/.test(c.w.document.getElementById("grid").innerHTML),"and the grid stays clean");
console.log(fail?"\n"+fail+" FAILED":"\nall passed");
process.exit(fail?1:0);
