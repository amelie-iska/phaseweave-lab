"use strict";

const find=id=>document.getElementById(id);
const n=new Intl.NumberFormat("en");
let evidence,paired;

function renderTable(parent,headers,rows){
  const view=document.createElement("div");
  view.className="table-overflow";
  const table=document.createElement("table");
  const title=table.createTHead().insertRow();
  for(const label of headers){
    const head=document.createElement("th");
    head.scope="col";head.textContent=label;title.append(head);
  }
  const body=table.createTBody();
  for(const items of rows){
    const row=body.insertRow();
    for(const [index,item] of items.entries()){
      const cell=document.createElement(index?"td":"th");
      if(!index)cell.scope="row";
      cell.textContent=item;
      row.append(cell);
    }
  }
  view.append(table);find(parent).replaceChildren(view);
}

function display(){
  if(!evidence)return;
  const split=find("horizon-split").value;
  const complete=find("horizon-support").value==="complete";
  const horizons=evidence.horizons_s;
  const size=complete?"all_horizons_rows":"rows";
  const mae=complete?"all_horizons_mae_bps":"mae_bps";
  const models=evidence.models;
  const fmt=value=>Number(value).toFixed(6);
  renderTable("horizon-models",["Model","Parameters","Selected epoch",...horizons.map(h=>h+" s")],[
    ...models.map(model=>[model.name,n.format(model.parameters),model.epoch,...horizons.map(h=>fmt(model.splits[split][h][mae]))]),
    ["Training-only ridge","—","—",...horizons.map(h=>fmt(evidence.controls.ridge[split][h][mae]))],
    ["Current-margin persistence","—","—",...horizons.map(h=>fmt(evidence.controls.persistence[split][h][mae]))],
    ["Tested rows","—","—",...horizons.map(h=>n.format(models[0].splits[split][h][size]))],
  ]);
  renderTable("horizon-corpus",["Split","Window keys","All five labels",...horizons.map(h=>h+" s labels")],
    Object.entries(evidence.corpus).map(([key,s])=>[key.replace("new_asset","unseen CHF"),n.format(s.rows),n.format(s.complete),
        ...horizons.map(h=>n.format(s.eligible[h]))]));
  if(paired?.contrasts.deep_minus_shallow[split]){
    renderTable("horizon-contrasts",["Comparison",...horizons.map(h=>h+" s")],
      Object.entries(paired.contrasts).map(([key,records])=>[
        key==="deep_minus_shallow"?"4+4 minus 2+2":"Torus branch minus 4+4",
        ...horizons.map(h=>{const row=records[split][h]; return fmt(row.delta_bps)+" ["+fmt(row.lower_95)+", "+fmt(row.upper_95)+"]";})
      ]));
  }else if(paired){
    find("horizon-contrasts").textContent="Select a holdout to see paired changes.";
  }
  find("horizon-status").textContent="Validation selects each model’s epoch. Model capacity and training budgets differ by row.";
}
function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{theme("dark");}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
find("horizon-split").addEventListener("change",display);
find("horizon-support").addEventListener("change",display);
fetch("horizons-v1.json").then(response=>{
  if(!response.ok)throw new Error("Missing horizon data");
  return response.json();
}).then(data=>{evidence=data;display();}).catch(()=>{find("horizon-status").textContent="Forecast measurements could not load.";});

fetch("horizon-depth-contrasts-v1.json").then(response=>{
  if(!response.ok)throw new Error("Missing paired contrasts");
  return response.json();
}).then(data=>{paired=data;display();}).catch(()=>{find("horizon-contrasts").textContent="Paired contrasts could not load.";});
