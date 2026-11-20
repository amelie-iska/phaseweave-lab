"use strict";

const byId=id=>document.getElementById(id);
const state={mode:"classical",classical:null,quantum:null,step:0,cell:0,timer:null};
const choices={
  classical:{
    file:"operator-ledger-v1.json",format:"phaseweave.operator-ledger.v1",
    sha:"e042087e2abaf3e3b7e46926c43b06fdf154873d67d388981e272ce3d1598ffe",
  },
  quantum:{
    file:"qudit-operator-ledger-v1.json",format:"phaseweave-qudit-operator-ledger-v1",
    sha:"7edead14dd1c4148e62e5a7367e5efafd6a0a177e6f76f0097325e6cfd53b4cf",
  },
};
const num=(n,digits=7)=>Number.isFinite(n)?n.toFixed(digits):"—";
const compact=(n)=>typeof n==="number"?Math.abs(n)<1e-5?n.toExponential(3):num(n):"—";
const sum=series=>series.reduce((a,b)=>a+b,0);
const times=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
const cround=([r,i])=>`${compact(r)} ${i<0?"−":"+"} ${compact(Math.abs(i))}i`;
const norm=([r,i])=>r*r+i*i;
const quantum=()=>state.mode==="quantum";
const series=()=>quantum()?state.quantum?.gates:state.classical?.operations;
const active=()=>series()?.[state.step];
const choose=()=>byId("operator-time").value;
const sceneColors=()=>{
  const css=getComputedStyle(document.documentElement);
  return Object.fromEntries(["line","faint","muted","text","copper","jade","violet"].map(k=>[k,css.getPropertyValue("--"+k).trim()]));
};

function matrixScene(sample){
  const values=sample.products||[];
  if(!values.length){
    const path=[[-1,0,.3],[0,.38,-.2],[1,0,.3]];
    const labels=["Embedding ID "+sample.embedding_id,"Channel "+sample.output_channel,compact(sample.native)];
    return {axes:[],grid:false,minExtent:1.4,framingScale:.46,
      points:path.map((point,i)=>({id:0,point,label:labels[i],color:["jade","violet","copper"][i],radius:7})),
      lines:[{coords:path,color:"line",width:2}]};
  }
  const begin=Math.max(0,Math.min(values.length-32,state.cell-15)), end=Math.min(values.length,begin+32);
  const data=[sample.left,sample.right,values], colors=["jade","violet","copper"];
  const maxes=data.map(row=>Math.max(1e-9,...row.slice(begin,end).map(Math.abs)));
  const points=[],lines=[];
  for(let i=begin;i<end;i++){
    const x=2.56*(i-begin)/Math.max(1,end-begin-1)-1.28;
    const selected=i===state.cell;
    const trace=data.map((row,j)=>{
      const raw=row[i], pre=Math.sign(raw)*Math.sqrt(Math.abs(raw/maxes[j]));
      const point=[x,(1-j)*.51,.68*pre];
      points.push({id:i,point,color:colors[j],radius:selected?6:3,alpha:selected?1:.64,
       label:selected?["Left","Right","Product"][j]:undefined});
      return point;
    });
    lines.push({coords:trace,color:selected?"text":"line",alpha:selected?.8:.33,width:selected?2:1});
  }
  return {axes:[],grid:false,points,lines,minExtent:1.4,framingScale:.46};
}

function quantumScene(gate){
  const values=gate[choose()];
  const points=state.quantum.basis.labels.map((label,index)=>{
    const [a,b,c,d]=label.split("").map(Number);
    const [r,i]=values[index], p=r*r+i*i, angle=Math.atan2(i,r);
    return {id:index,point:[(a-1)*.83+(d-1)*.22,(b-1)*.83+(d-1)*.18,(c-1)*.83+(d-1)*.22],
      color:p<1e-12?"line":`hsl(${(angle/Math.PI+1)*180} 61% 60%)`,
      radius:index===state.cell?7:2+15*Math.sqrt(p),alpha:index===state.cell?1:p<1e-12?.32:.82,
      label:index===state.cell?"|"+label+"⟩":undefined};
  });
  return {axes:[],grid:false,points,lines:[],minExtent:1.18,framingScale:.42};
}

const draw=Reasoning3D.bind(byId("operator-scene"),byId("operator-camera"),paint,selectPoint);
function paint(){
  const item=active();
  if(item)draw(quantum()?quantumScene(item):matrixScene(item.sample),sceneColors());
}
function selectPoint(focus){
  state.cell=focus;
  render();
}
function details(rows){
  byId("operator-detail").replaceChildren(...rows.flatMap(([label,value])=>{
    const term=document.createElement("dt"),desc=document.createElement("dd");
    term.textContent=label;
    desc.textContent=value;
    return [term,desc];
  }));
}
function table(headers,rows,caption,selected=-1){
  const t=document.createElement("table"), th=t.createTHead().insertRow(), body=t.createTBody();
  if(caption)t.createCaption().textContent=caption;
  headers.forEach(heading=>{
    const cell=document.createElement("th");cell.scope="col";cell.textContent=heading;th.append(cell);
  });
  rows.forEach((row,index)=>{
    const line=body.insertRow();
    if(index===selected)line.className="operator-selected";
    row.forEach(value=>line.insertCell().textContent=value);
  });
  return t;
}

function matrixPanel(op){
  const sample=op.sample, products=sample.products||[];
  const selector=byId("operator-cell");
  selector.max=Math.max(0,products.length-1);
  selector.disabled=!products.length;
  state.cell=Math.min(state.cell,Number(selector.max));
  selector.value=state.cell;
  byId("operator-scene-help").textContent=products.length?
    "The jade, violet and copper tiers show the left factor, right factor and their product. Each tier scales its signed magnitudes independently.":
    "The embedding ID and channel select one learned table entry.";
  byId("operator-numeric-help").textContent=products.length?
    "The selected dot product is reconstructed from every channel. You can scroll through all terms below.":
    "The embedding operation gathers the selected row entry by ID.";
  const shape=Object.entries(op.shapes||{}).filter(([,v])=>Array.isArray(v))
    .map(([name,dims])=>name+" "+dims.join(" × ")).join(" · ");
  const bits=[["Stage",op.stage],["Native operator",op.native_operator||op.kind],["Shapes",shape],
    ["Native output",compact(sample.native)],["Output channel",String(sample.output_channel??"—")]];
  const numeric=byId("operator-tables");
  if(products.length){
    const bias=Number.isFinite(sample.bias)?sample.bias:0;
    const i=state.cell, prefix=sum(products.slice(0,i+1));
    bits.push(["Term",(i+1)+" of "+products.length],
      ["Exact factor pair",compact(sample.left[i])+" × "+compact(sample.right[i])],
      ["Product",compact(products[i])],["Partial sum",compact(prefix)],["Bias",compact(bias)],
      ["Reconstructed output",compact(sample.reconstructed)],["Difference",compact(sample.abs_error)]);
    if(Number.isFinite(sample.scale)) bits.push(["µP scale",compact(sample.scale)]);
    if(sample.left_before_mup)bits.push(["Unscaled left factor",compact(sample.left_before_mup[i])]);
    let running=0;
    const shown=products.map((term,j)=>[String(j+1),compact(sample.left[j]),compact(sample.right[j]),compact(term),compact(running+=term)]);
    numeric.replaceChildren(table(["Channel","Left","Right","Product","Running sum"],shown,"Complete selected dot product",i));
  }else{
    bits.push(["Embedding ID",String(sample.embedding_id??"—")]);
    numeric.replaceChildren(table(["Gather index","Channel","Native output"],[[sample.embedding_id,sample.output_channel,compact(sample.native)]],"Selected embedding entry"));
  }
  details(bits);
  const run=state.classical.run||{};
  byId("operator-provenance").textContent="Deep TokenGT · "+(run.parameters?.toLocaleString("en")||"")+
    " parameters · checkpoint "+(run.checkpoint_sha256||"");
}

function contributions(gate,index){
  const label=state.quantum.basis.labels[index], digits=label.split("").map(Number);
  const operator=gate.operator;
  if(operator.representation==="diagonal"){
    const matrixIndex=gate.wires.reduce((k,wire)=>k*3+digits[wire],0);
    return [[index,operator.diagonal[matrixIndex]]];
  }
  const wire=gate.wires[0];
  return operator.matrix[digits[wire]].map((value,k)=>{
    const replaced=[...digits];replaced[wire]=k;
    return [parseInt(replaced.join(""),3),value];
  });
}

function flow(){
  const container=byId("operator-flow");
  const makeRow=label=>{
    const row=document.createElement("div"), key=document.createElement("span");
    row.className="operator-flow-row";key.className="operator-flow-key";key.textContent=label;row.append(key);
    return row;
  };
  const makeStep=(index,label,description)=>{
    const button=document.createElement("button");
    button.type="button";button.dataset.step=String(index);button.textContent=label;button.title=description;
    button.setAttribute("aria-label",description);
    button.addEventListener("click",()=>selectStep(index));
    return button;
  };
  if(quantum()){
    container.replaceChildren(...Array.from({length:4},(_,wire)=>{
      const row=makeRow("Qutrit "+(wire+1));
      series().forEach((gate,index)=>{
        if(gate.wires.includes(wire))row.append(makeStep(index,String(index+1),gate.name+" on wire "+(wire+1)));
        else{const link=document.createElement("span");link.className="operator-flow-wire";row.append(link);}
      });
      return row;
    }));
  }else{
    const row=makeRow("Stages");
    const labels={input:"In",tokenizer:"Tok",readout:"Out"};
    let previous;
    series().forEach((item,index)=>{
      if(item.stage===previous)return;
      previous=item.stage;
      const label=labels[item.stage]||item.stage[0].toUpperCase()+item.stage.slice(-1);
      const button=makeStep(index,label,"Jump to "+item.stage);
      button.dataset.stage=item.stage;
      row.append(button);
    });
    container.replaceChildren(row);
  }
  byId("operator-flow-panel").hidden=false;
}

function gateHeatmap(gate){
  const canvas=byId("operator-heatmap"), context=canvas.getContext("2d");
  const side=state.quantum.basis.labels.length, size=canvas.width/side;
  const colors=sceneColors();
  context.fillStyle=colors.faint;context.fillRect(0,0,canvas.width,canvas.height);
  for(let output=0;output<side;output++){
    for(const [input,[r,i]] of contributions(gate,output)){
      const magnitude=Math.hypot(r,i);
      if(magnitude<1e-10)continue;
      const hue=(Math.atan2(i,r)/Math.PI+1)*180;
      context.fillStyle="hsl("+hue+" 68% "+(25+44*Math.sqrt(magnitude))+"%)";
      context.fillRect(input*size,output*size,size,size);
    }
  }
  context.strokeStyle=colors.copper;context.lineWidth=1.5;
  context.strokeRect(1,state.cell*size,canvas.width-2,size);
}

function quantumPanel(gate){
  const data=state.quantum, labels=data.basis.labels;
  const before=gate.before, after=gate.after;
  const selected=state.cell=Math.min(before.length-1,state.cell);
  const selector=byId("operator-cell");
  selector.max=before.length-1;selector.value=selected;selector.disabled=false;
  const values=gate[choose()];
  const amplitude=values[selected];
  const rows=contributions(gate,selected).map(([index,factor])=>[index,factor,times(factor,before[index])]);
  const real=sum(rows.map(([, ,prod])=>prod[0])),imag=sum(rows.map(([, ,prod])=>prod[1]));
  details([["Gate",gate.name],["Definition",gate.source],["Operator form",gate.operator.representation],["Qutrit wires",gate.wires.map(w=>w+1).join(", ")],
    ["Selected basis","|"+labels[selected]+"⟩"],["Amplitude",cround(amplitude)],["Probability",num(norm(amplitude))],
    ["Phase (rad)",norm(amplitude)>1e-18?num(Math.atan2(amplitude[1],amplitude[0])):"Undefined at zero amplitude"],
    ["Squared state norm",num(sum(values.map(norm)))],["Traced after",cround(after[selected])],
    ["Recomputed row",cround([real,imag])],["Row error",compact(Math.hypot(real-after[selected][0],imag-after[selected][1]))]]);
  byId("operator-scene-help").textContent="Each point is a base-3 computational basis state. Size follows amplitude magnitude. Hue displays its phase.";
  byId("operator-numeric-help").textContent="The selected output amplitude is a sum over the nonzero row of this gate. Below are all 81 before and after amplitudes.";
  const operatorRows=gate.operator.representation==="diagonal"?
    gate.operator.diagonal.map((n,j)=>[String(j),cround(n),num(gate.operator.phases_rad?.[j])]):
    gate.operator.matrix.map((row,j)=>[String(j),...row.map(cround)]);
  const operatorHeaders=gate.operator.representation==="diagonal"?["Local basis","Diagonal","Phase (rad)"]:["Row","Column 0","Column 1","Column 2"];
  const matrices=table(operatorHeaders,operatorRows,"Local operator");
  const products=table(["Source basis","Operator entry","Before","Complex product"],rows.map(([i,v,p])=>[labels[i],cround(v),cround(before[i]),cround(p)]),"Reconstruction of the selected output row");
  const states=table(["Basis","Before","After","After probability"],
    labels.map((s,i)=>[s,cround(before[i]),cround(after[i]),num(norm(after[i]))]),"Complete state vector",selected);
  const finalClock=data.measurement.clock_expectations||[];
  const observed=table(["Final wire","P(0)","P(1)","P(2)","Clock cosine expectation"],
    finalClock.map((value,i)=>[String(i+1),...data.measurement.marginals[i].map(v=>num(v)),num(value)]),"Measurement after the final gate");
  const projected=table(["Channel","Value"],data.measurement.projected_patch.map((value,i)=>[String(i+1),num(value)]),"Projected circuit feature");
  byId("operator-tables").replaceChildren(matrices,products,states,observed,projected);
  byId("operator-provenance").textContent=data.source.run_id+" · "+data.source.utc+" · checkpoint "+data.source.checkpoint_sha256;
  gateHeatmap(gate);
}

function render(){
  const item=active();
  if(!item)return;
  byId("operator-step").value=String(state.step);
  byId("operator-cell-label").textContent=quantum()?"Output basis state":"Contraction term";
  byId("operator-time-label").hidden=!quantum();
  byId("operator-lift").hidden=!quantum();
  const flowPanel=byId("operator-flow-panel");
  let currentStep;
  for(const button of flowPanel.querySelectorAll("button")){
    const selected=quantum()?Number(button.dataset.step)===state.step:button.dataset.stage===item.stage;
    button.setAttribute("aria-pressed",String(selected));
    if(selected)currentStep=button;
  }
  if(currentStep){
    const bounds=flowPanel.getBoundingClientRect(), target=currentStep.getBoundingClientRect();
    if(target.right>bounds.right)flowPanel.scrollLeft+=target.right-bounds.right+8;
    else if(target.left<bounds.left)flowPanel.scrollLeft+=target.left-bounds.left-8;
  }
  if(quantum())quantumPanel(item);
  else matrixPanel(item);
  byId("operator-status").textContent=(quantum()?item.name:item.module)+" · "+(state.step+1)+" of "+series().length;
  paint();
}
function pause(){
  if(state.timer)clearInterval(state.timer);
  state.timer=null;
  byId("operator-play").textContent="Play operations";
}
async function switchMode(next){
  pause();
  state.mode=next;state.step=0;state.cell=0;
  for(const name of Object.keys(choices))byId("operator-"+name).setAttribute("aria-pressed",String(name===next));
  try{
    if(!state[next]){
      byId("operator-status").textContent="Loading the saved trace.";
      const choice=choices[next], response=await fetch(choice.file);
      if(!response.ok)throw new Error("Trace missing");
      const bytes=await response.arrayBuffer();
      if(crypto.subtle){
        const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
        const hash=Array.from(digest,x=>x.toString(16).padStart(2,"0")).join("");
        if(hash!==choice.sha)throw new Error("Trace hash mismatch");
      }
      const data=JSON.parse(new TextDecoder().decode(bytes));
      if((data.format||data.schema)!==choice.format)throw new Error("Trace version mismatch");
      state[next]=data;
    }
    if(state.mode!==next)return;
    byId("operator-step").replaceChildren(...series().map((item,j)=>new Option((j+1)+" · "+(item.name||item.module),String(j))));
    flow();
    render();
  }catch{
    if(state.mode===next)byId("operator-status").textContent="The saved trace could not load.";
  }
}
function selectStep(index){
  pause();state.step=index;state.cell=0;render();
}
function matrixPosition(event){
  const box=event.currentTarget.getBoundingClientRect();
  const count=state.quantum.basis.labels.length;
  const component=(position,start,size)=>Math.min(count-1,Math.max(0,Math.floor(count*(position-start)/size)));
  return [component(event.clientY,box.top,box.height),component(event.clientX,box.left,box.width)];
}
byId("operator-heatmap").addEventListener("pointermove",event=>{
  const [row,column]=matrixPosition(event);
  const value=contributions(active(),row).find(([index])=>index===column)?.[1]||[0,0];
  const labels=state.quantum.basis.labels;
  byId("operator-heat-tip").textContent="⟨"+labels[row]+"| U |"+labels[column]+"⟩ = "+cround(value);
});
byId("operator-heatmap").addEventListener("click",event=>selectPoint(matrixPosition(event)[0]));
byId("operator-step").addEventListener("change",e=>selectStep(Number(e.target.value)));
byId("operator-time").addEventListener("change",render);
byId("operator-cell").addEventListener("input",e=>{state.cell=Number(e.target.value);render();});
byId("operator-play").addEventListener("click",()=>{
  if(state.timer){pause();return;}
  if(!series()?.length)return;
  if(state.step===series().length-1)state.step=0;
  byId("operator-play").textContent="Pause operations";
  state.timer=setInterval(()=>{
    if(state.step>=series().length-1){pause();return;}
    state.step+=1; state.cell=0;render();
  },820);
});
for(const mode of Object.keys(choices))byId("operator-"+mode).addEventListener("click",()=>switchMode(mode));
function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
  paint();
  if(quantum()&&active())gateHeatmap(active());
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
window.addEventListener("resize",paint);
switchMode(new URLSearchParams(location.search).get("mode")==="quantum"?"quantum":"classical");
