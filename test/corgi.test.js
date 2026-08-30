const fs=require("fs"), {JSDOM}=require("jsdom");
const S="/tmp/claude-0/-home-user-Metrics/80007829-a004-5ea5-bf37-88f25f92eb5c/scratchpad";
let fail=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c)fail++;};

for (const [name, file, holder] of [["tracker","/home/user/Metrics/daily-readout.html",".shell"],
                                    ["views",   S+"/views.html",                        ".wrap"]]) {
  console.log("\n-- " + name + " --");
  const H = fs.readFileSync(file,"utf8");
  const css = H.replace(/\s+/g," ");
  ok(/body::before \{[^}]*position: fixed/.test(css), "corgi layer is fixed behind the page");
  ok(/body::before \{[^}]*pointer-events: none/.test(css), "never intercepts a tap");
  ok(/body::before \{[^}]*background-color: var\(--ink\)/.test(css), "tinted from a token, so it follows the theme");
  ok(/-webkit-mask-image: url\("data:image\/svg\+xml/.test(css), "webkit mask present (iOS Safari)");
  ok(/[^-]mask-image: url\("data:image\/svg\+xml/.test(css), "standard mask present");
  const op = css.match(/body::before \{[^}]*opacity: ([\d.]+)/);
  ok(op && parseFloat(op[1]) <= .08, "kept to a whisper: opacity " + (op&&op[1]));
  const re = new RegExp("\\"+holder+" \\{[^}]*z-index: ?1");
  ok(re.test(css), "content sits above it (" + holder + " z-index 1)");
  ok(!/url\("https?:/.test(css), "no external image request to be blocked");
}

console.log("\n-- the tracker still works --");
const HTML=fs.readFileSync("/home/user/Metrics/daily-readout.html","utf8");
const jar={};
const w=new JSDOM("<!doctype html><html><head><meta charset='utf-8'></head><body>"+HTML+"</body></html>",
 {runScripts:"dangerously",pretendToBeVisual:true,url:"https://a.test/",
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;
   Object.defineProperty(w,"localStorage",{value:{getItem:k=>(k in jar?jar[k]:null),
    setItem:(k,v)=>{jar[k]=String(v);},removeItem:k=>{delete jar[k];}},configurable:true});}}).window;
setTimeout(()=>{
  ok(w.document.querySelectorAll("#rows > *, #petrows > *").length===13,"13 markers still render");
  const sub=c=>[...w.document.getElementById("rows").children]
    .find(b=>b.querySelector(".row-code").textContent===c).querySelector(".row-sub").textContent.trim().replace(/^:\s*/,"");
  ok(sub("GRN")==="Sun · Mon · Wed","greens schedule intact");
  ok(sub("SAU")==="Sun–Tue","sauna schedule intact");
  ok(w.document.getElementById("packHead").textContent==="No Refill","supply panel intact");
  ok(w.document.getElementById("syncText").textContent.length>0,"sync row intact");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
