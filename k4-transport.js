"use strict";

const K4Transport = (() => {
  // Signed indices 1, 2, 3, 4 encode the quaternion basis 1, i, j, k.
  const table = [[1,2,3,4],[2,-1,4,-3],[3,-4,-1,2],[4,3,-2,-1]];
  const baseGauge = [1,1,1,1], alternateGauge = [2,-3,4,2];
  const triangles = ["012","023","013","123"];
  const routes = [...triangles,"0123","0132","0213"];
  const edges = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const multiply = (a,b) => Math.sign(a*b)*table[Math.abs(a)-1][Math.abs(b)-1];
  const inverse = a => Math.abs(a)===1 ? a : -a;
  const trace = a => Math.abs(a)===1 ? a : 0;
  const label = a => (a<0?"−":"")+["1","i","j","k"][Math.abs(a)-1];
  function path(key,reversed=false) {
    if(!routes.includes(key)) throw new Error("Unknown cycle");
    const points=[...key].map(Number);
    return [points[0],...(reversed?points.slice(1).reverse():points.slice(1)),points[0]];
  }
  function link(a,b,connection,gauge=baseGauge) {
    if(a===b) throw new Error("Vertex loops are absent");
    const [u,v]=a<b?[a,b]:[b,a];
    const chord=u===0?1 : u===2?3 : v===2?2 : connection*4;
    const directed=a<b?chord:inverse(chord);
    return multiply(gauge[b],multiply(directed,inverse(gauge[a])));
  }
  function transport(vertices,connection,gauge=baseGauge) {
    const factors=[],prefixes=[1];
    for(let i=1;i<vertices.length;i++){
      const factor=link(vertices[i-1],vertices[i],connection,gauge);
      factors.push(factor);
      prefixes.push(multiply(factor,prefixes.at(-1)));
    }
    return {factors,prefixes,full:prefixes.at(-1),normalized:trace(prefixes.at(-1))};
  }
  return {triangles,routes,edges,baseGauge,alternateGauge,multiply,inverse,trace,label,path,link,transport};
})();
if(typeof module!=="undefined")module.exports=K4Transport;

if(typeof document!=="undefined"){
  const q=K4Transport, $=id=>document.getElementById(id);
  const pos=[[0,1.07,.07],[-1.12,-.55,.53],[.24,-.39,-1.15],[.91,-.58,.79]];
  let timer=null;
  const digits = n => n>0?"+"+n:String(n).replace("-","−");
  function config(){
    return {gauge:$("gauge").value==="rotated"?q.alternateGauge:q.baseGauge,
      variant:Number($("connection").value), route:q.path($("cycle").value,$("direction").value==="reverse"),
      progress:Number($("step").value)};
  }
  function paint(){
    const {route,progress,variant,gauge}=config(), last=route.length-1;
    const palette=Object.fromEntries(["text","muted","line","jade","copper","violet"].map(name=>[name,getComputedStyle(document.documentElement).getPropertyValue("--"+name).trim()]));
    const lines=q.edges.map(([a,b])=>({coords:[pos[a],pos[b]],color:(a===1&&b===3)?"violet":"line",
      alpha:.79,width:a===1&&b===3?2.1:1.45,dash:a===1&&b===3?[3,4]:[]}));
    for(let j=1;j<=progress;j++){
      const a=pos[route[j-1]],b=pos[route[j]];
      const trim=(fraction)=>a.map((v,i)=>v+(b[i]-v)*fraction);
      lines.push({coords:[trim(.07),trim(.91)],color:j===progress?"copper":"jade",width:j===progress?3.6:2.6,arrow:true});
    }
    const points=pos.map((point,i)=>({point,color:i===route[progress]?"copper":route.includes(i)?"jade":"muted",
      radius:i===route[progress]?6.5:4.6,label:"v"+i}));
    for(let j=1;j<=progress;j++){
      const start=pos[route[j-1]],end=pos[route[j]];
      const midpoint=start.map((v,i)=>(v+end[i])/2);
      points.push({point:midpoint,color:j===progress?"copper":"jade",radius:1.3,
        label:q.label(q.link(route[j-1],route[j],variant,gauge))});
    }
    const faces=last===3?[{coords:route.slice(0,-1).map(i=>pos[i]),color:"jade",alpha:.1}]:[];
    draw({axes:[],grid:false,framingScale:.42,minExtent:1.2,lines,points,faces},palette);
  }
  const draw = Reasoning3D.bind($("k4-view"),$("camera"),paint,()=>{});
  function cells(parent, texts) {
    const tr=document.createElement("tr");
    texts.forEach((value,i)=>{
      const td=document.createElement(i===0?"th":"td");
      if(i===0)td.scope="row";
      if(typeof value==="string")td.textContent=value;else td.append(value);
      tr.append(td);
    });
    parent.append(tr);
    return tr;
  }
  function stop(){
    clearInterval(timer);timer=null;
    $("play").textContent="Play path";$("play").setAttribute("aria-pressed","false");
  }
  function selectRoute(key){
    stop();$("cycle").value=key;$("step").max=key.length;$("step").value=key.length;render();
  }
  function render(){
    const {route,progress,variant,gauge}=config();
    const key=$("cycle").value, current=q.transport(route,variant,gauge);
    $("route-heading").textContent=(key.length===3?"Triangle ":"Four-edge cycle ")+key;
    $("route-text").textContent=route.join(" → ");
    $("step-value").textContent=progress+" / "+(route.length-1);
    $("word").textContent=progress ? current.factors.slice(0,progress).reverse().map(q.label).join(" · ")+" = "+q.label(current.prefixes[progress]) : "H₀ = 1";
    $("prefix-note").textContent=progress===route.length-1?"Closed return at v"+route[0]+". The table compares both connections on this cycle.":progress===0?"Identity at v"+route[0]+". Advance a link to begin.":"Open transport from v"+route[0]+" to v"+route[progress]+". The table below gives the completed loop.";
    $("comparison").replaceChildren();
    for(const s of [1,-1]){
      const r=q.transport(route,s,gauge);
      cells($("comparison"),[s===1?"A":"B",q.label(r.full),digits(r.normalized)]);
    }
    $("all-traces").replaceChildren();
    for(const triangle of q.triangles){
      const button=document.createElement("button");
      button.type="button";button.textContent=triangle;button.setAttribute("aria-label","Inspect triangle "+triangle);
      button.setAttribute("aria-pressed",String(triangle===key));button.addEventListener("click",()=>{selectRoute(triangle);$("cycle").focus();});
      const t=q.path(triangle,$("direction").value==="reverse");
      const row=cells($("all-traces"),[button,...[1,-1].map(s=>digits(q.transport(t,s,gauge).normalized))]);
      row.dataset.selected=String(triangle===key);
    }
    $("gauge-description").textContent="Current vertex gauges (v0, v1, v2, v3) = ("+gauge.map(q.label).join(", ")+"). For an edge v→w, the displayed matrix is U′ = g(w) U g(v)⁻¹.";
    paint();
  }
  function theme(next){
    document.documentElement.dataset.theme=next;
    ["dark","light"].forEach(key=>$(key).setAttribute("aria-pressed",String(key===next)));
    try{localStorage.setItem("phaseweave-theme",next);}catch{}
    paint();
  }
  $("dark").addEventListener("click",()=>theme("dark"));$("light").addEventListener("click",()=>theme("light"));
  $("cycle").addEventListener("change",()=>selectRoute($("cycle").value));
  for(const id of ["connection","gauge","direction"])$(id).addEventListener("change",()=>{stop();render();});
  $("step").addEventListener("input",()=>{stop();render();});
  $("play").addEventListener("click",()=>{
    if(timer){stop();return;}
    if($("step").value===$("step").max)$("step").value=0;
    $("play").setAttribute("aria-pressed","true");$("play").textContent="Pause path";render();
    timer=setInterval(()=>{
      $("step").value=Number($("step").value)+1;render();
      if($("step").value===$("step").max)stop();
    },850);
  });
  window.addEventListener("pagehide",stop);
  window.addEventListener("resize",paint);
  try{if(localStorage.getItem("phaseweave-theme")==="light")theme("light");}catch{}
  render();
}
