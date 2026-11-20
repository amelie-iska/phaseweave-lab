"use strict";
const field=id=>document.getElementById(id);
let latest=null,held=null,failed=false;
const shown=(value,digits)=>value==null?"—":Number(value).toFixed(digits);
function render(){
  if(!latest)return;
  const holding=(!latest.fresh||failed)&&field("fee-hold").checked&&held;
  const table=holding?held.tiers:latest.tiers;
  const labels=latest.statistics;
  const eligible=latest.fresh&&!failed;
  field("fee-status").textContent=(failed?"Feed disconnected. ":"")+
    (eligible?"Fresh at "+latest.grid_utc:holding?"Last eligible snapshot "+held.grid_utc:"Waiting for a fresh complete quote triangle")+
    " · "+(labels.complete||0)+" eligible / "+(labels.grid_seconds||0)+" evaluated grid seconds.";
  const size=Number(field("fee-size").value);
  field("fee-tiers").tBodies[0].replaceChildren(...table.map(tier=>{
    const tr=document.createElement("tr"),th=document.createElement("th");
    th.scope="row";th.textContent=tier.tier;tr.append(th);
    tr.insertCell().textContent=shown(tier.taker_bps,1);
    tr.insertCell().textContent=shown(tier.three_leg_fee_drag_log_bps,4);
    const item=tier.notionals.find(row=>row.initial_usdt===size);
    for(const value of item.net_log_bps){
      const cell=tr.insertCell();
      cell.textContent=eligible||holding?shown(value,4):"—";
      if((eligible||holding)&&value!=null)cell.style.color=value>=0?"var(--jade)":"var(--copper)";
    }
    return tr;
  }));
}
async function poll(){
  try{
    const response=await fetch("/api/paper-tournament/status",{cache:"no-store",signal:AbortSignal.timeout(2200)});
    if(!response.ok)throw new Error("Source failed");
    const data=await response.json();
    if(data.mode!=="fee scenarios"||data.tiers.length!==4)throw new Error("Not a fee worker");
    failed=false;latest=data;
    if(data.fresh)held=data;
    if(!held&&data.last_eligible)held=data.last_eligible;
    render();
  }catch{
    failed=true;
    if(latest)render();
    else field("fee-status").textContent="Open this page from the local fee scenario worker on port 8143.";
  }
  setTimeout(poll,700);
}
for(const id of ["fee-size","fee-hold"])field(id).addEventListener("change",render);
poll();
