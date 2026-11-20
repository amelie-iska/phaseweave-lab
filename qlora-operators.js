"use strict";

const node=id=>document.getElementById(id);
const model={data:null,layer:0,op:0,rank:0,view:"model"};
const precise=value=>Number(value).toPrecision(7);
const operations=()=>model.data?.operations.filter(op=>op.layer===model.layer)||[];
const active=()=>operations()[model.op];
const colorKeys=["text","line","muted","jade","violet","copper"];
const draw=Reasoning3D.bind(node("lora-canvas"),node("lora-camera"),paint,(index)=>{
  if(model.view==="rank"){
    model.rank=index;
    render();
  }else{
    const layer=model.data.layers[index]?.layer;
    if(layer!==undefined)chooseLayer(layer);
  }
});
function paint(){
  if(!model.data)return;
  const css=getComputedStyle(document.documentElement);
  const palette=Object.fromEntries(colorKeys.map(key=>[key,css.getPropertyValue("--"+key).trim()]));
  const op=active();
  const stack=model.data.layers.map(layer=>({stage:"Decoder "+(1+Math.floor(layer.layer/8)*8)+"–"+(Math.floor(layer.layer/8)*8+8)}));
  const selected=model.data.layers.findIndex(x=>x.layer===model.layer);
  const plot=op&&model.view==="rank"?TensorVolumes.contraction({
    left:op.intermediate,right:op.B_output_row,products:op.terms,
  },model.rank):TensorVolumes.architecture(stack,selected);
  draw(plot,palette);
}
function details(entries){
  node("lora-details").replaceChildren(...entries.flatMap(([key,value])=>{
    const term=document.createElement("dt"),desc=document.createElement("dd");
    term.textContent=key;desc.textContent=value;
    return [term,desc];
  }));
}
function table(labels,rows){
  const output=document.createElement("table"), heading=output.createTHead().insertRow(), body=output.createTBody();
  for(const label of labels){
    const item=document.createElement("th");
    item.scope="col";item.textContent=label;heading.append(item);
  }
  rows.forEach(row=>{
    const line=body.insertRow();
    row.forEach(value=>line.insertCell().textContent=String(value));
  });
  return output;
}
function chooseLayer(layer){
  model.layer=layer;model.op=0;model.rank=0;
  node("lora-layer").value=String(layer);
  const ops=operations();
  node("lora-op").replaceChildren(...ops.map((x,i)=>new Option(x.module.split(".").slice(1).join("."),String(i))));
  render();
}
function render(){
  const {data,rank,view,layer}=model;
  if(!data)return;
  const op=active();
  node("lora-status").textContent=data.layers.length+" observed decoder blocks · "+data.operations.length+" low-rank projections · "+
    data.input.token_count+" input tokens";
  document.querySelectorAll("[data-lora-view]").forEach(b=>b.setAttribute("aria-pressed",String(view===b.dataset.loraView)));
  node("lora-rank").disabled=!op;
  node("lora-rank").value=rank;
  if(op){
    const rankRows=op.terms.map((term,i)=>[i+1,precise(op.intermediate[i]),precise(op.B_output_row[i]),precise(term)]);
    const inputRows=op.input_tile.map((value,i)=>[i+1,precise(value),precise(op.A_tile[i]),precise(value*op.A_tile[i])]);
    node("lora-terms").replaceChildren(table(["Rank","A · x","B coefficient","Scaled product"],rankRows),
      table(["Input tile channel","Hidden token","A coefficient (selected rank)","Product"],inputRows));
    details([["Decoder layer",String(layer+1)],["A shape",op.matrices.A.join(" × ")],["B shape",op.matrices.B.join(" × ")],
      ["Output coordinate",String(op.output_channel)],["Scaled term",precise(op.terms[rank])],
      ["Reconstructed adapter update",precise(op.recomputed_adapter_delta)],["Native combined output",precise(op.native_combined_output)],
      ["Low-rank reduction error",precise(op.reconstruction_error)]]);
  }else{
    details([["Decoder layer",String(layer+1)],["Hidden shape",data.layers.find(r=>r.layer===layer)?.shape.join(" × ")||"—"]]);
    node("lora-terms").textContent="This block has no captured adapter projection.";
  }
  paint();
}
async function load(){
  const answer=await fetch("qlora-operator-trace-v1.json");
  if(!answer.ok)throw new Error("Missing adapter trace");
  const data=await answer.json();
  if(data.format!=="phaseweave.qlora-operator-trace.v1")throw new Error("Unexpected trace format");
  model.data=data;
  node("lora-layer").replaceChildren(...data.layers.map(layer=>new Option(String(layer.layer+1),String(layer.layer))));
  node("lora-prompt").textContent=data.prompt;
  node("lora-tokens").replaceChildren(table(["Token ID","Decoded token","Logit"],
    data.next_token.map(row=>[row.id,JSON.stringify(row.token),precise(row.logit)])));
  chooseLayer(data.operations[0].layer);
}
node("lora-layer").addEventListener("change",event=>chooseLayer(Number(event.target.value)));
node("lora-op").addEventListener("change",event=>{model.op=Number(event.target.value);render();});
node("lora-rank").addEventListener("input",event=>{model.rank=Number(event.target.value);render();});
document.querySelectorAll("[data-lora-view]").forEach(b=>b.addEventListener("click",()=>{model.view=b.dataset.loraView;render();}));
function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
  paint();
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
window.addEventListener("resize",paint);
load().catch(()=>{node("lora-status").textContent="The adapter trace could not be loaded.";});
