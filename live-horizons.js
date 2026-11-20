"use strict";
const element=id=>document.getElementById(id);
const s={last:null,lost:0};
const format=(v,p=5)=>v==null?"—":typeof v==="number"?v.toFixed(p):String(v);
function details(parent,rows){
  parent.replaceChildren(...rows.flatMap(([label,value])=>{
    const term=document.createElement("dt"),desc=document.createElement("dd");
    term.textContent=label;desc.textContent=value;return [term,desc];
  }));
}
function render(){
  const d=s.last;
  if(!d)return;
  const p=d.profile;
  const sel=element("shadow-selected");
  const values=d.horizons.map(row=>String(row.seconds));
  if(JSON.stringify([...sel.options].map(x=>x.value))!==JSON.stringify(values)){
    sel.replaceChildren(...values.map(x=>new Option(x+" s",x)));
  }
  const which=d.horizons.find(row=>String(row.seconds)===sel.value);
  element("live-horizon-state").textContent=s.lost>0?"Disconnected. Showing the last recorded profile.":
    "Live shadow · last capture "+(d.latest_utc||"waiting")+" · profile "+d.profile_version;
  details(element("shadow-profile"),[["Data resolution",p.sample_step_s+" s"],["History",p.input_frames+" frames"],
    ["Decision cadence",p.forecast_every_s+" s"],["Enabled horizons",p.horizons_s.join(", ")+" s"],
    ["Inference limit",p.max_compute_ms+" ms"],["Compute p95",format(d.compute_ms_p95,2)+" ms"],
    ["Fresh / grid",String(d.seconds.fresh||0)+" / "+String(d.seconds.grid_seconds||0)],
    ["Over budget",String(d.seconds.over_budget||0)],["Pending labels",String(d.pending)],
    ...(d.configuration_error?[["Configuration error",d.configuration_error]]:[])]);
  const forecast=which?.latest;
  details(element("shadow-last"),forecast?[["Origin UTC",forecast.origin_utc],
      ["Deep TokenGT, both orientations",forecast.forecast.deep.map(x=>format(x)).join(" / ")],
      ["Torus TokenGT, both orientations",forecast.forecast.torus.map(x=>format(x)).join(" / ")]]:
      [["Forecast","Waiting for an eligible origin"]]);
  const tbody=element("shadow-table").tBodies[0];
  tbody.replaceChildren(...d.horizons.map(h=>{
    const row=document.createElement("tr"),th=document.createElement("th");
    th.scope="row";th.textContent=h.seconds+" s";
    row.append(th);
    const cells=[h.issued,h.scored,h.missing,...["deep","torus","persistence"].map(key=>format(h.mae_bps[key]))];
    cells.forEach(value=>row.insertCell().textContent=String(value));
    return row;
  }));
}
async function poll(){
  try{
    const response=await fetch("/api/paper-tournament/status",{cache:"no-store",signal:AbortSignal.timeout(2000)});
    if(!response.ok)throw new Error("Feed failed");
    const data=await response.json();
    if(data.mode!=="shadow only"||!Array.isArray(data.horizons))throw new Error("Wrong worker");
    s.last=data;s.lost=0;render();
  }catch{
    s.lost++;
    if(s.last)render();
    else element("live-horizon-state").textContent="Open this page from the local horizon shadow worker on port 8142.";
  }
  setTimeout(poll,1000);
}
element("shadow-selected").addEventListener("change",render);
poll();
