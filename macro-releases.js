"use strict";

const el=id=>document.getElementById(id);
const states={data:null,release:null};
const foldNames={train:"August train",validation:"September validation",stress:"September stress",test:"October test",new_asset:"Unseen CHF"};
const number=new Intl.NumberFormat("en-US");
const stamp=value=>new Date(value).toISOString().replace("T"," ").replace(".000Z"," UTC");
const draw=Reasoning3D.bind(el("macro-graph"),el("macro-camera"),update);
function facts(values){
  el("macro-details").replaceChildren(...values.flatMap(([key,value])=>{
    const t=document.createElement("dt"), d=document.createElement("dd");
    t.textContent=key;d.textContent=value;
    return [t,d];
  }));
}
function update(){
  if(!states.release)return;
  const r=states.release;
  const releaseClock=Date.parse(r.embargo_utc);
  const time=Number(el("macro-offset").value), at=releaseClock+1000*time;
  const visible=at>Date.parse(r.modeled_available_utc)&&time<states.data.maximum_release_age_seconds;
  const measurements=Object.entries(r.measures);
  const palette={};
  const css=getComputedStyle(document.documentElement);
  for(const color of ["line","muted","text","jade","copper","violet"])palette[color]=css.getPropertyValue("--"+color).trim();
  const pub=[-1.20,.50,.19], release=[-.43,.22,-.12], decision=[1.00,-.75,.17];
  const colors=visible?"copper":"line";
  const points=[
    {point:pub,color:"jade",label:"BLS",radius:7},
    {point:release,color:"violet",label:r.family==="cpi"?"CPI release":"Employment release",radius:8},
    {point:decision,color:colors,label:"FX decision",radius:8},
  ];
  const links=[{coords:[pub,release],color:"violet",arrow:true,alpha:.7},
    {coords:[release,decision],color:colors,arrow:visible,dash:visible?[]:[4,4],alpha:visible?.95:.53}];
  measurements.forEach(([key],i)=>{
    const name={cpi_u_sa_mom:"CPI-U",payroll_sa_mom:"Payrolls",unemployment_sa_rate:"Unemployment"}[key];
    const point=[.54,.72-i*.58,i%2?-.52:.48];
    points.push({point,color:visible?"jade":"line",label:name,radius:6});
    links.push({coords:[release,point],color:visible?"jade":"line",alpha:.72,arrow:true});
  });
  draw({grid:false,axes:[],points,lines:links,framingScale:.47,minExtent:1.5},palette);
  const status=visible?"Eligible for this decision":"Hidden from this decision";
  el("macro-status").textContent=status+" · "+stamp(at);
  const rows=[["BLS release",r.document_id],["Reference month",r.reference_month],["Official embargo",stamp(releaseClock)],
    ["Modeled receipt",stamp(r.modeled_available_utc)],["Decision offset",time+" s"],["Feature edge",visible?"known_release":"No edge"]];
  if(visible)for(const [key,value] of measurements){
    const {label, unit}=states.data.series[key];
    rows.push([label,number.format(value)+(unit==="percent"?"%":" "+unit)]);
  }
  facts(rows);
  el("macro-source").href=r.source;
}
async function load(){
  const response=await fetch("bls-release-graph-v1.json");
  if(!response.ok)throw new Error("Graph receipt missing");
  const data=await response.json();
  if(data.schema!=="phaseweave.bls-release-graph.v1")throw new Error("Graph format differs");
  states.data=data;
  el("macro-release").replaceChildren(...data.releases.map(r=>new Option((r.family==="cpi"?"CPI":"Jobs")+" · "+r.reference_month,r.id)));
  el("macro-release").value=data.releases.at(-1).id;
  states.release=data.releases.at(-1);
  for(const [fold,entry] of Object.entries(data.coverage)){
    const line=el("macro-coverage").tBodies[0].insertRow();
    const key=document.createElement("th");
    key.scope="row";key.textContent=foldNames[fold];line.append(key);
    for(const value of [entry.rows,entry.after_guard_within_5m,entry.after_guard_within_24h,entry.release_ids.length]){
      line.insertCell().textContent=number.format(value);
    }
  }
  update();
}
el("macro-release").addEventListener("change",()=>{
  states.release=states.data.releases.find(r=>r.id===el("macro-release").value);
  update();
});
el("macro-offset").addEventListener("input",update);
function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
  update();
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
window.addEventListener("resize",update);
load().catch(()=>{el("macro-status").textContent="The release graph could not be loaded.";});
