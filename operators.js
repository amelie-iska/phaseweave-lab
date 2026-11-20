"use strict";

const byId=id=>document.getElementById(id);
const state={mode:"classical",classical:null,quantum:null,view:"stack",variant:null,
  registry:[],modelKey:"deep",selectionSequence:0,step:0,cell:0,timer:null};
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
const scalar=value=>Array.isArray(value)?cround(value):compact(value);
const add=(a,b)=>Array.isArray(a)?[a[0]+b[0],a[1]+b[1]]:a+b;
const norm=([r,i])=>r*r+i*i;
const quantum=()=>state.mode==="quantum";
const matrix=()=>state.variant||state.classical;
const circuit=()=>state.variant?state.variant.circuit:state.quantum;
const series=()=>quantum()?circuit()?.gates:matrix()?.operations;
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
  const points=circuit().basis.labels.map((label,index)=>{
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
  if(!item)return;
  if(quantum())draw(quantumScene(item),sceneColors());
  else if(state.view==="stack")draw(TensorVolumes.architecture(series(),state.step),sceneColors());
  else{
    const values=item.sample;
    const plot=values.left?.some(Array.isArray)?{...values,
      left:values.left.map(x=>Math.hypot(...x)),right:values.right.map(x=>Math.hypot(...x)),
      products:values.products.map(x=>Math.hypot(...x))}:values;
    const layout=state.view==="tensor"&&plot.products?.length?TensorVolumes.contraction(plot,state.cell):matrixScene(plot);
    draw(layout,sceneColors());
  }
}
function selectPoint(focus){
  if(!quantum()&&state.view==="stack"){
    selectStep(focus);
    setView("tensor");
    return;
  }
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
  const count=sample.term_count??products.length;
  const tropical=sample.reducer==="max", complex=products.some(Array.isArray);
  const reduce=tropical?Math.max:add;
  selector.max=Math.max(0,products.length-1);
  selector.disabled=!products.length;
  state.cell=Math.min(state.cell,Number(selector.max));
  selector.value=state.cell;
  byId("operator-scene-help").textContent=state.view==="stack"?
    "Follow the signal down the stage stack. Select a stage to open its first operation.":
    products.length?"The three tiers show the left factor, right factor and each "+(tropical?"sum before the maximum.":"product before accumulation.")+
    (complex?" Complex values are drawn by magnitude.":" Signed magnitudes scale within each tier."):
    "The embedding ID and channel select one learned table entry.";
  byId("operator-numeric-help").textContent=products.length?
    "The native result was checked against all "+count+" terms. This trace displays "+products.length+" by index.":
    "The embedding operation gathers the selected row entry by ID.";
  const shape=Object.entries(op.shapes||{}).filter(([,v])=>Array.isArray(v))
    .map(([name,dims])=>name+" "+dims.join(" × ")).join(" · ");
  const bits=[["Stage",op.stage],["Native operator",op.native_operator||op.kind],["Shapes",shape],
    ["Native output",scalar(sample.native)],["Output channel",String(sample.output_channel??"—")]];
  const numeric=byId("operator-tables");
  if(products.length){
    const bias=sample.bias;
    const i=state.cell, prefix=products.slice(0,i+1).reduce(reduceTerm);
    function reduceTerm(a,b){return reduce(a,b);}
    bits.push(["Term",(i+1)+" of "+count],
      ["Exact factor pair",scalar(sample.left[i])+(tropical?" + ":" × ")+scalar(sample.right[i])],
      [tropical?"Path score":"Product",scalar(products[i])],[tropical?"Partial maximum":"Partial sum",scalar(prefix)]);
    if(!tropical)bits.push(["Bias",scalar(bias)]);
    bits.push(["Reconstructed output",scalar(sample.reconstructed)],["Difference",compact(sample.abs_error)]);
    if(Number.isFinite(sample.scale)) bits.push(["µP scale",compact(sample.scale)]);
    if(sample.left_before_mup)bits.push(["Unscaled left factor",compact(sample.left_before_mup[i])]);
    let running;
    const shown=products.map((term,j)=>{
      running=j===0?term:reduce(running,term);
      return [String(j+1),scalar(sample.left[j]),scalar(sample.right[j]),scalar(term),scalar(running)];
    });
    const title=tropical?"Selected max-plus output":"Selected dot product";
    numeric.replaceChildren(table(["Channel","Left","Right",tropical?"Path score":"Product",tropical?"Running maximum":"Running sum"],shown,title,i));
  }else{
    bits.push(["Embedding ID",String(sample.embedding_id??"—")]);
    numeric.replaceChildren(table(["Gather index","Channel","Native output"],[[sample.embedding_id,sample.output_channel,compact(sample.native)]],"Selected embedding entry"));
  }
  details(bits);
  const run=matrix().run||{};
  byId("operator-provenance").textContent=(run.id||"Deep TokenGT")+" · "+(run.parameters?.toLocaleString("en")||"")+
    " parameters · checkpoint "+(run.checkpoint_sha256||"");
}

function contributions(gate,index){
  const label=circuit().basis.labels[index], digits=label.split("").map(Number);
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
    const labels={input:"In",tokenizer:"Tok",readout:"Out","hybrid-attention":"Att","phase-patch":"Φ",surface:"Torus"};
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
  const side=circuit().basis.labels.length, size=canvas.width/side;
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

function modelOptions(width){
  const options=[];
  if(width==="all"||width==="200")options.push(new Option("Deep TokenGT · width 200 (full term trace)","deep"));
  for(const run of state.registry){
    if(width==="all"||String(run.width)===width)options.push(new Option(run.label,run.label));
  }
  const select=byId("operator-model");
  select.replaceChildren(...options);
  select.value=options.some(o=>o.value===state.modelKey)?state.modelKey:options[0]?.value;
}

async function selectModel(key){
  const sequence=++state.selectionSequence;
  const record=state.registry.find(run=>run.label===key);
  pause();
  byId("operator-status").textContent="Loading the selected checkpoint trace.";
  try{
    const item=record?await readTrace(await fetch("operator-runs-v1/"+record.file),record.sha256,
        "phaseweave.variant-operators.v1"):null;
    if(sequence!==state.selectionSequence)return;
    state.modelKey=key;
    state.variant=item;
    if(item&&item.run.checkpoint_sha256!==record.checkpoint_sha256)throw new Error("Checkpoint hash disagreement");
    byId("operator-selection").textContent=record?
      [record.parameters.toLocaleString("en")+" parameters",record.labels.backbone.replaceAll("_"," + "),
       record.labels.temporal_attention,record.labels.patch||"no phase patch",
       record.selection_unit+" "+record.selected_epoch,record.operation_count+" recorded operations"].join(" · "):
      "Full-term walkthrough for the validation-selected 4+4 model";
    byId("operator-quantum").disabled=Boolean(record&&!record.circuit);
    byId("operator-quantum").title=record&&!record.circuit?"This checkpoint has no coherent state-vector trace":"";
    await switchMode(quantum()&&(!record||record.circuit)?"quantum":"classical");
  }catch{
    if(sequence!==state.selectionSequence)return;
    byId("operator-model").value=state.modelKey;
    byId("operator-status").textContent="The selected checkpoint trace could not load.";
  }
}

async function loadRegistry(){
  try{
    const registry=await readTrace(await fetch("operator-runs-v1/index.json"),
      "616d66613136c7e3d9911e568641a4e490983a491ecffca7773c467f66401e68","phaseweave.operator-index.v1");
    state.registry=registry.runs;
    const widths=[...new Set(registry.runs.map(run=>run.width))].sort((a,b)=>a-b);
    const widthSelect=byId("operator-width");
    widthSelect.append(...widths.map(width=>new Option(String(width),String(width))));
    modelOptions("all");
    const requested=new URLSearchParams(location.search).get("model");
    if(requested&&state.registry.some(record=>record.label===requested)){
      byId("operator-model").value=requested;
      await selectModel(requested);
    }
  }catch{
    byId("operator-selection").textContent="The checkpoint roster could not load. The full-term deep trace is still available.";
  }
}

byId("operator-width").addEventListener("change",event=>{
  modelOptions(event.target.value);
  const next=byId("operator-model").value;
  if(next!==state.modelKey)selectModel(next);
});
byId("operator-model").addEventListener("change",event=>selectModel(event.target.value));

function quantumPanel(gate){
  const data=circuit(), labels=data.basis.labels;
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
  byId("operator-views").hidden=quantum();
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
    if(!state.variant&&!state[next]){
      byId("operator-status").textContent="Loading the saved trace.";
      const choice=choices[next], response=await fetch(choice.file);
      if(!response.ok)throw new Error("Trace missing");
      state[next]=await readTrace(response,choice.sha,choice.format);
    }
    if(state.mode!==next)return;
    byId("operator-step").replaceChildren(...series().map((item,j)=>new Option((j+1)+" · "+(item.name||item.module),String(j))));
    flow();
    render();
  }catch{
    if(state.mode===next)byId("operator-status").textContent="The saved trace could not load.";
  }
}
async function readTrace(response,expected,format){
  if(!response.ok)throw new Error("Trace missing");
  const bytes=await response.arrayBuffer();
  if(crypto.subtle){
    const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const hash=Array.from(digest,x=>x.toString(16).padStart(2,"0")).join("");
    if(hash!==expected)throw new Error("Trace hash mismatch");
  }
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if((data.format||data.schema)!==format)throw new Error("Trace version mismatch");
  return data;
}
function setView(view){
  state.view=view;
  document.querySelectorAll("[data-model-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.modelView===view)));
  render();
}
for(const button of document.querySelectorAll("[data-model-view]")){
  button.addEventListener("click",()=>setView(button.dataset.modelView));
}
function selectStep(index){
  pause();state.step=index;state.cell=0;render();
}
function matrixPosition(event){
  const box=event.currentTarget.getBoundingClientRect();
  const count=circuit().basis.labels.length;
  const component=(position,start,size)=>Math.min(count-1,Math.max(0,Math.floor(count*(position-start)/size)));
  return [component(event.clientY,box.top,box.height),component(event.clientX,box.left,box.width)];
}
byId("operator-heatmap").addEventListener("pointermove",event=>{
  const [row,column]=matrixPosition(event);
  const value=contributions(active(),row).find(([index])=>index===column)?.[1]||[0,0];
  const labels=circuit().basis.labels;
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
switchMode(new URLSearchParams(location.search).get("mode")==="quantum"?"quantum":"classical").then(loadRegistry);
