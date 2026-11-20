"use strict";
const get=id=>document.getElementById(id);
let source;

function render(){
  if(!source)return;
  const choice=get("portfolio-market").value;
  const metric=Number(get("portfolio-metric").value);
  const market=Object.hasOwn(source.rows[0].scores,choice)?choice:
    Object.keys(source.rows[0].scores).find(key=>key.toLowerCase().replace(/[^a-z0-9]/g,"").replace("sandp500","sp500")===choice);
  const factor=metric===1?-1:1;
  const rows=[...source.rows].sort((a,b)=>factor*(b.scores[market][metric]-a.scores[market][metric])||a.model.localeCompare(b.model));
  const view=document.createElement("div");
  view.className="table-overflow";
  const table=document.createElement("table");
  const head=table.createTHead().insertRow();
  ["Model","Family","ARR ↑","AVol ↓","MDD ↑","ASR ↑","IR ↑"].forEach(label=>{
    const cell=document.createElement("th");cell.scope="col";cell.textContent=label;head.append(cell);
  });
  const body=table.createTBody();
  for(const [rank,item] of rows.entries()){
    const row=body.insertRow(), th=document.createElement("th");
    th.scope="row";th.textContent=item.model;row.append(th);
    row.insertCell().textContent=item.family;
    item.scores[market].forEach((result,i)=>{
      const cell=row.insertCell();
      if(i===metric&&rank<2){
        const marker=document.createElement(rank===0?"strong":"u");
        marker.textContent=result.toFixed(3);cell.append(marker);
      }else cell.textContent=result.toFixed(3);
    });
  }
  view.append(table);
  get("portfolio-results").replaceChildren(view);
  get("portfolio-status").textContent=rows.length+" published methods · maximum drawdown is signed, closer to zero is better.";
}
get("portfolio-market").addEventListener("change",render);
get("portfolio-metric").addEventListener("change",render);
function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
fetch("portfolio-literature-v1.json").then(response=>{
  if(!response.ok)throw new Error("table unavailable");
  return response.json();
}).then(data=>{source=data;render();}).catch(()=>{get("portfolio-status").textContent="The published table could not load.";});
