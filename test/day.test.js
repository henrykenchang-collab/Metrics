const fs=require("fs"), {JSDOM}=require("jsdom");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const back=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d);};
const TODAY=iso(new Date());

function open(jar, sess) {
  jar=jar||{}; sess=sess||{};
  const dom=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
   {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
     for (const [name,store] of [["localStorage",jar],["sessionStorage",sess]])
       Object.defineProperty(w,name,{value:{getItem:k=>(k in store?store[k]:null),
        setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},configurable:true});}});
  return {w:dom.window, jar, sess};
}
const dow=w=>w.document.getElementById("dow").textContent;

console.log("\n-- the bug: a tab left open overnight --");
let c=open({}, {"dailyReadout.cur": back(1)});          // the OLD format, yesterday
ok(dow(c.w)==="Today", "a stale plain-string entry no longer pins the view to yesterday");

c=open({}, {"dailyReadout.cur": JSON.stringify({d:back(1), on:back(1)})});
ok(dow(c.w)==="Today", "a day remembered on an earlier date is ignored");

console.log("\n-- but a reload mid-session still returns you --");
c=open({}, {"dailyReadout.cur": JSON.stringify({d:back(3), on:TODAY})});
ok(/· 3 days back$/.test(dow(c.w)), "a day opened today survives a save-triggered reload: "+dow(c.w));

console.log("\n-- and the round trip writes the new shape --");
c=open({},{});
const stored=JSON.parse(c.sess["dailyReadout.cur"]);
ok(stored.d===TODAY && stored.on===TODAY, "stores {d,on}: "+JSON.stringify(stored));

console.log("\n-- an old day is now unmistakable --");
c=open({}, {"dailyReadout.cur": JSON.stringify({d:back(1), on:TODAY})});
ok(dow(c.w)==="Yesterday", 'reads "Yesterday", not a bare weekday');
ok(c.w.document.getElementById("dow").classList.contains("past"), "and is tinted as off-today");
ok(!c.w.document.getElementById("todayBtn").hidden, "Back to Today is offered");
c=open({},{});
ok(dow(c.w)==="Today" && !c.w.document.getElementById("dow").classList.contains("past"),
   "today is unchanged, still accent");

console.log("\n-- nothing else moved --");
c=open({},{});
setTimeout(()=>{
  const sub=x=>[...c.w.document.getElementById("rows").children]
    .find(b=>b.querySelector(".row-code").textContent===x).querySelector(".row-sub").textContent.trim().replace(/^:\s*/,"");
  ok(sub("GRN")==="Sun · Mon · Wed","greens intact");
  ok(sub("SAU")==="Sun–Tue","sauna intact");
  ok(c.w.document.getElementById("packHead").textContent==="No Refill","supply intact");
  ok(/body::before/.test(HTML),"corgi intact");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
