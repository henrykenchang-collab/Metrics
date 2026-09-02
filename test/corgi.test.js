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
  console.log("\n-- and a small one on the Trend Charts link --");
  const link=w.document.getElementById("chartsLink");
  const mark=link.querySelector(".corgi-mark");
  ok(!!mark,"the link carries a corgi mark");
  ok(mark.tagName.toLowerCase()==="svg","drawn inline, not fetched");
  ok(link.firstElementChild===mark,"and it sits before the words, not after");
  ok(link.textContent.indexOf("Trend Charts")===0,"the label itself is untouched: "+JSON.stringify(link.textContent));
  ok(mark.getAttribute("aria-hidden")==="true","hidden from a screen reader -- the link already says where it goes");
  ok(/fill: currentColor/.test(HTML.replace(/\s+/g," ").match(/\.corgi-mark \{[^}]*\}/)[0]),
     "inked from the link's own colour, so it follows the theme");
  const px=HTML.replace(/\s+/g," ").match(/\.corgi-mark \{[^}]*width: ([\d.]+)px/);
  ok(px&&parseFloat(px[1])<=16,"kept small: "+(px&&px[1])+"px");

  console.log("\n-- Shanti, in colour, at the head of her own panel --");
  const petHead=[...w.document.querySelectorAll("section.panel .panel-head")]
    .find(h=>h.textContent.indexOf("Shanti and Buddha")===0);
  ok(!!petHead,"the Shanti and Buddha head is found by its exact text");
  ok(petHead.querySelector(".code").textContent==="Shanti and Buddha",
     "the heading text is untouched by the drawing sitting in it: "+JSON.stringify(petHead.querySelector(".code").textContent));
  const shanti=petHead.querySelector(".shanti-mark");
  ok(!!shanti,"she is drawn there");
  ok(shanti.tagName.toLowerCase()==="svg","inline, not a fetched image");
  ok(shanti.getAttribute("aria-hidden")==="true","hidden from a screen reader; the heading already names her");
  ok(petHead.querySelector(".code").firstElementChild===shanti,"she sits before the words");
  ok(shanti.querySelectorAll("[fill]").length>10,"a full-colour drawing, not a one-tone mark: "+shanti.querySelectorAll("[fill]").length+" filled parts");
  // the ids she carries must not collide with anything else on the page
  ["shHead","shBody","shEarL","shEarR","shSable"].forEach(id=>
    ok(w.document.querySelectorAll("#"+id).length===1,id+" is unique in the document"));
  ok(!w.document.querySelector(".shell .shanti-mark:not(.panel-head .shanti-mark)")
     || [...w.document.querySelectorAll(".shanti-mark")].length===1,
     "she appears once, in her own panel, and nowhere else");

  console.log("\n-- Buddha, right next to her --");
  const buddha=petHead.querySelector(".buddha-mark");
  ok(!!buddha,"he is drawn there too");
  ok(buddha.tagName.toLowerCase()==="svg","inline, not a fetched image");
  ok(buddha.getAttribute("aria-hidden")==="true","hidden from a screen reader; the heading already names him");
  const kids=[...petHead.querySelector(".code").children];
  ok(kids.indexOf(shanti)===0 && kids.indexOf(buddha)===1,
     "Shanti first, Buddha right after her, both before the words");
  ok(buddha.querySelectorAll("[fill]").length>10,"a full-colour drawing, not a one-tone mark: "+buddha.querySelectorAll("[fill]").length+" filled parts");
  // his ids must not collide with hers or anything else on the page
  ["bdHead"].forEach(id=>
    ok(w.document.querySelectorAll("#"+id).length===1,id+" is unique in the document"));
  ok([...w.document.querySelectorAll(".buddha-mark")].length===1,
     "he appears once, in the same panel, and nowhere else");
  // a cat, not a second corgi: round ears and whiskers, neither of which
  // Shanti's drawing has
  ok(buddha.querySelectorAll("g[stroke] path").length>=6,
     "carries whiskers -- thin strokes Shanti's corgi mark has none of");

  console.log("\n-- the tracker still works --");
  ok(w.document.querySelectorAll("#rows > .row, #petrows > .row").length===14,"14 markers still render");
  const sub=c=>[...w.document.getElementById("rows").querySelectorAll(".row")]
    .find(b=>b.querySelector(".row-code").textContent===c).querySelector(".row-sub").textContent.trim().replace(/^:\s*/,"");
  ok(sub("GRN")==="Sun · Mon · Wed","greens schedule intact");
  ok(sub("SAU")==="Sun–Tue","sauna schedule intact");
  ok(w.document.getElementById("packHead").textContent==="No Refill","supply panel intact");
  ok(w.document.getElementById("syncText").textContent.length>0,"sync row intact");
  console.log(fail?"\n"+fail+" FAILED":"\nall passed");
  process.exit(fail?1:0);
},150);
