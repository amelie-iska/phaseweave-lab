"use strict";

const el=id=>document.getElementById(id);
const num=(n,digits=5)=>Number.isFinite(n)?n.toFixed(digits):"—";
const sequence=n=>Array.from({length:n},(_,i)=>i);
const options=(n,prefix)=>sequence(n).map(i=>[i,prefix+" "+(i+1)]);
const state={network:null,surface:null,mode:"network",step:0,head:0,query:0,key:0,channel:0,history:15,output:0,cell:0,timer:null};
const current=()=>state[state.mode];
const palette=()=>{
  const css=getComputedStyle(document.documentElement);
  return Object.fromEntries(["line","faint","muted","text","copper","jade","violet"].map(k=>[k,css.getPropertyValue("--"+k).trim()]));
};
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const matrix=(stage)=>stage.domain==="spatial"&&stage.history_attention?
  stage.history_attention[state.history][state.head]:stage.attention[state.head];

function networkScene(){
  if(!state.network)return {axes:[],points:[],lines:[],grid:false};
  const stages=state.network.stages;
  const visible=stages.slice(0,state.step+1);
  const selected=stages[state.step], channel=state.channel;
  const points=[],lines=[];
  const row=(stage,index,j)=>[(index-(stages.length-1)/2)*.45,
    ((stage.labels.length-1)/2-j)*.145,Math.tanh(stage.hidden_out[j][channel])*.78];
  for(const [i,stage] of visible.entries()){
    for(const [j,label] of stage.labels.entries()){
      const active=i===state.step&&j===state.query;
      const showLabel=i===state.step&&(active||j===state.key);
      const point=row(stage,i,j);
      points.push({id:i===state.step?j:null,point,color:!stage.mask[j]?"muted":active?"copper":stage.domain==="spatial"?"jade":"violet",
                   alpha:stage.mask[j]?1:.30,radius:active?7:3.6,label:showLabel?label:null});
      if(i>0&&stages[i-1].domain===stage.domain)
        lines.push({coords:[row(stages[i-1],i-1,j),point],color:"line",alpha:.38});
    }
  }
  if(state.history===15||selected.domain==="temporal"){
    for(const [key,weight] of matrix(selected)[state.query].entries()){
      if(weight<.00001||key===state.query)continue;
      const q=row(selected,state.step,state.query),k=row(selected,state.step,key);
      const bend=[q[0]+.28,(q[1]+k[1])/2,(q[2]+k[2])/2+.20];
      lines.push({coords:[k,bend,q],color:key===state.key?"copper":"jade",alpha:.19+.81*weight,
        width:1+4*weight,arrow:true});
    }
  }
  return {axes:[],points,lines,grid:false,minExtent:1.4,framingScale:.47};
}

function torus([i,j],n){
  const u=2*Math.PI*i/n,v=2*Math.PI*j/n, radius=.95+.34*Math.cos(v);
  return [radius*Math.cos(u),.34*Math.sin(v),radius*Math.sin(u)];
}

function surfaceScene(){
  const trace=state.surface;
  if(!trace)return {axes:[],points:[],lines:[],grid:false};
  const {mesh,n,layer}=surfaceStep();
  const points=mesh.vertices.map((p,i)=>({point:torus(p,n),radius:2.6,color:"muted",alpha:.8}));
  const lines=mesh.edge_index.map(([a,b],i)=>{
    const head=mesh.vertices[a].slice();
    const axis=i%2;
    const coords=sequence(10).map(part=>{
      const move=head.slice();move[axis]+=part/9;return torus(move,n);
    });
    const chosen=i===state.cell, field=mesh.connection[i];
    return {coords,color:chosen?"violet":Math.abs(field)>1e-6?field>0?"copper":"jade":"line",
      width:chosen?3.2:Math.abs(field)>1e-6?2:1,alpha:chosen?1:Math.abs(field)>1e-6?.84:.41,arrow:chosen};
  });
  for(const [i,edge] of mesh.edge_index.entries()){
    const p=mesh.vertices[edge[0]].slice();
    p[i%2]+=.5;
    const value=layer?.edge_out[i][state.channel]??mesh.connection[i];
    const curvature=torus(p,n);
    points.push({id:i,point:curvature,color:i===state.cell?"violet":value>=0?"copper":"jade",
      radius:Math.min(8,2+Math.abs(value)*3),alpha:i===state.cell?1:.46});
  }
  return {axes:[],points,lines,grid:false,minExtent:1.33,framingScale:.42};
}

const draw=Reasoning3D.bind(el("architecture-canvas"),el("arch-camera"),paintScene,selectPoint);

function paintScene(){
  draw(state.mode==="network"?networkScene():surfaceScene(),palette());
}

function selectPoint(point){
  if(state.mode==="network")state.query=point;
  else state.cell=point;
  render();
}

function pick(name,label,values){
  const box=document.createElement("label");
  box.textContent=label+" ";
  const select=document.createElement("select");
  select.id="arch-"+name;
  for(const [value,title] of values) select.add(new Option(title,String(value)));
  if(!values.some(([value])=>value===state[name])) state[name]=values[0][0];
  select.value=state[name];
  select.addEventListener("change",()=>{state[name]=Number(select.value);render();el("arch-"+name)?.focus();});
  box.append(select);
  return box;
}

function detail(items){
  const container=el("arch-details");
  const children=items.flatMap(([key,value])=>{
    const dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=key;dd.textContent=value;return [dt,dd];
  });
  container.replaceChildren(...children);
}

function plainTable(headers,rows){
  const table=document.createElement("table"), head=table.createTHead().insertRow();
  for(const key of headers){
    const cell=document.createElement("th");cell.scope="col";cell.textContent=key;head.append(cell);
  }
  const body=table.createTBody();
  for(const values of rows){
    const row=body.insertRow();
    for(const value of values)row.insertCell().textContent=value;
  }
  return table;
}

function heatmap(stage){
  const weights=matrix(stage), labels=stage.labels;
  const table=plainTable(["Query / Key",...labels],[]);
  const body=table.tBodies[0];
  for(const [q,values] of weights.entries()){
    const row=body.insertRow();
    const title=document.createElement("th");title.scope="row";title.textContent=labels[q];row.append(title);
    if(q===state.query)title.className="pivot";
    for(const [k,w] of values.entries()){
      const cell=row.insertCell(),button=document.createElement("button");
      cell.className="att-cell";
      button.textContent=num(w,3);
      button.style.backgroundColor=`color-mix(in srgb, var(--jade) ${Math.round(w*67)}%, var(--canvas))`;
      button.setAttribute("aria-label",labels[q]+" to "+labels[k]+": "+num(w,6));
      button.setAttribute("aria-pressed",String(q===state.query&&k===state.key));
      button.addEventListener("click",()=>{state.query=q;state.key=k;render();});
      cell.append(button);
    }
  }
  return table;
}

function networkInspector(){
  const data=state.network,stage=data.stages[state.step];
  const labels=stage.labels.map((name,i)=>[i,name]);
  const inputs=[pick("head","Head",options(stage.shape.heads,"Head")),pick("query","Query",labels),
    pick("key","Key",labels),pick("channel","Hidden channel",options(stage.shape.channels,"Channel"))];
  if(stage.domain==="spatial")inputs.push(pick("history","Spatial frame",data.input.frame_utc.map((utc,i)=>[i,utc.slice(11,19)+" UTC"])));
  el("arch-selectors").replaceChildren(...inputs);
  const channel=state.channel, head=state.head;
  const [q,k]=[state.query,state.key];
  const weight=matrix(stage)[q][k];
  const fullDetail=stage.domain==="temporal"||state.history===15;
  const component=channel%stage.shape.head_channels;
  const label=stage.domain==="temporal"?data.input.frame_utc[q]:data.input.frame_utc[15];
  const metrics=[["Stage shape",`${stage.shape.tokens} tokens × ${stage.shape.channels} · ${stage.shape.heads} heads`],
    ["Selected attention",num(weight,7)],["Selected row sum",num(matrix(stage)[q].reduce((a,b)=>a+b,0),7)]];
  if(fullDetail){
    const QVector=stage.q[head][q], KVector=stage.k[head][k], VVector=stage.v[head][k];
    metrics.push(["Computation time",label],["Key availability",stage.mask[k]?"Observed token":"Masked token"],
      ["Q · K × score scale",stage.mask[k]?num(dot(QVector,KVector)*stage.score_multiplier,7):"Masked"],
      ["Head gate",num(stage.gate[head],7)],["Head subchannel",String(component+1)],
      ["Q component",num(QVector[component])],["K component",num(KVector[component])],
      ["V component",num(VVector[component])],["Attention × V",num(weight*VVector[component],7)],
      ["Input → attention → FFN → output",
        [stage.hidden_in[q][channel],stage.attention_delta[q][channel],stage.ffn_delta[q][channel],stage.hidden_out[q][channel]].map(v=>num(v)).join("  ·  ")]);
  }else metrics.push(["Frame scope","This frame exposes native attention. Select the final frame for Q, K, V and residual values."]);
  if(stage.domain==="temporal"&&state.step===data.stages.findIndex(s=>s.domain==="temporal")){
    const pool=data.pooling;
    metrics.push(["Mean pooled channel",num(pool.frame_vectors[q][channel])],
      ["Learned position channel",num(pool.position[q][channel])],
      ["Actual temporal input",num(pool.temporal_input[q][channel])]);
  }
  if(stage.domain==="spatial"&&fullDetail&&state.step===0){
    const vector=data.input.tokenized_anchor[q];
    metrics.push(["Tokenized channel",num(vector?.[channel])],
      ["Token kind",data.input.token_kind[q]]);
    if(q>=3){
      const values=data.input.features[15][q-3];
      metrics.push(["Raw edge input",values.map(v=>num(v)).join(" · ")]);
    }
  }
  detail(metrics);
  el("arch-matrix-title").textContent="Native attention weights";
  el("arch-matrix-note").textContent=fullDetail?
    "Choose a cell to inspect its query, key and value. The 3D view links the keys feeding the highlighted query.":
    "The 3D residual states remain at the final spatial frame. The heatmap uses the selected history frame.";
  el("arch-matrix").replaceChildren(heatmap(stage));
  el("arch-scene-description").textContent="Horizontal position is layer depth. The vertical rows are tokens. Height in the third dimension is the selected hidden channel.";
  return stage.domain+" block "+stage.layer+" / "+(stage.domain==="spatial"?data.run.graph_layers:data.run.time_layers);
}

function surfaceStep(){
  const data=state.surface;
  if(state.step===0)return {mesh:data.fine,n:4,layer:null,label:"Read observed and auxiliary edges"};
  if(state.step<=data.fine.layers.length)return {mesh:data.fine,n:4,layer:data.fine.layers[state.step-1],label:"Fine edge update "+state.step};
  if(state.step===data.fine.layers.length+1)return {mesh:data.coarse,n:2,layer:null,label:"Coarse restriction"};
  const i=state.step-data.fine.layers.length-2;
  return {mesh:data.coarse,n:2,layer:data.coarse.layers[i],label:"Coarse edge update "+(i+1)};
}

function surfaceInspector(){
  const data=state.surface;
  const {mesh,n,layer,label}=surfaceStep();
  const edgeOpts=mesh.edge_index.map(([a,b],i)=>[i,`Edge ${i} · ${a} → ${b}`]);
  if(state.cell>=edgeOpts.length)state.cell=0;
  if(state.channel>=32)state.channel=0;
  el("arch-selectors").replaceChildren(pick("cell","Edge",edgeOpts),pick("channel","Hidden channel",options(32,"Channel")));
  const i=state.cell,ch=state.channel;
  const metrics=[["Periodic cells",`${mesh.vertices.length} vertices · ${mesh.edge_index.length} edges · ${mesh.face_boundaries.length} faces`],
    ["Edge connection",num(mesh.connection[i],7)+" log bps"],
    ["Tail/head",mesh.edge_index[i].join(" → ")]];
  if(layer){
    const [a,b]=mesh.edge_index[i];
    metrics.push(["Input edge channel",num(layer.edge_in[i][ch])],["Tail vertex message",num(layer.vertex_message[a][ch])],
     ["Head vertex message",num(layer.vertex_message[b][ch])],["Output edge channel",num(layer.edge_out[i][ch])]);
  }
  if(n===2&&data.restriction?.edge_map){
    const row=data.restriction.edge_map[i];
    metrics.push(["Fine edge path",row.map((value,j)=>value?j:null).filter(j=>j!==null).join(" + ")]);
  }
  detail(metrics);
  el("arch-matrix-title").textContent="Face circulation and loop holonomy";
  el("arch-matrix-note").textContent="The coarse boundary operator commutes with restriction. Each coarse face curl is the sum over its four oriented fine faces.";
  const table=plainTable(["Face","Signed boundary","Curl (log bps)",...(layer?["Message channel"]:[])],
    mesh.face_boundaries.map((face,i)=>[String(i),face.map(([e,sign])=>(sign>0?"+":"−")+e).join(" "),
      num(mesh.face_curl[i],7),...(layer?[num(layer.face_message[i][ch])]:[])]));
  const cycles=plainTable(["Cycle","Edge path","Signed log bps","Gross factor"],
    mesh.cycles.map(c=>[c.label,c.edge_ids.join(" → "),num(c.log_bp,7),num(c.gross_factor,7)]));
  el("arch-matrix").replaceChildren(cycles,table);
  el("arch-scene-description").textContent=n===4?
    "Four fine edges on one periodic row carry the lifted quote triangle. Other edges supply computational geometry.":
    "Each coarse edge sums two directed fine cochains. The 2×2 periodic graph has distinct wrap-around edges.";
  return label;
}

function readout(){
  const data=current();
  if(!data)return;
  const outputs=data.readout.outputs;
  const choice=el("arch-output");
  choice.replaceChildren(...outputs.map((o,i)=>new Option(o.horizon_s+" s · "+o.direction,String(i))));
  choice.value=state.output;
  const selected=outputs[state.output];
  const main=plainTable(["Prediction term","Log bps"],[
    ["Current-margin persistence",num(selected.persistence_log_bp,7)],
    ["Learned correction",num(selected.correction_log_bp??selected.prediction_log_bp-selected.persistence_log_bp,7)],
    ["Forecast",num(selected.prediction_log_bp,7)]
  ]);
  if(state.mode==="network"){
    const r=data.readout,i=state.output;
    const parts=[["Prior residual",num(r.prior_residual[i],7)],...r.last_temporal_heads.map((head,index)=>["Last temporal head "+(index+1),num(head[i],7)]),
      ["Attention projection bias",num(r.attention_projection_bias[i],7)],["FFN",num(r.ffn_component[i],7)],
      ["Final normalization and readout bias",num(r.normalization_and_readout_bias[i],7)]];
    const channels=plainTable(["Channel","Normalized value","Correction contribution"],
      r.contributions[i].map((weight,j)=>[String(j+1),num(r.normalized[j],7),num(weight,7)]));
    el("arch-readout-note").textContent="Decomposition uses the realized final normalization statistics. It is additive for this trace and does not measure causal importance.";
    el("arch-readout").replaceChildren(main,plainTable(["Last block contribution","Log bps"],parts),channels);
  }else{
    el("arch-readout-note").textContent="The trained surface vector adds to the final temporal state before normalization and all ten margin outputs.";
    const r=data.readout;
    const fields=["temporal","surface","corrected"].map(key=>r[key]||r[key+"_vector"]);
    const table=fields.every(Array.isArray)?plainTable(["Channel","Temporal","Surface","Corrected"],
      fields[0].map((v,i)=>[String(i+1),num(v,7),num(fields[1][i],7),num(fields[2][i],7)])):null;
    const ablation=plainTable(["Within-checkpoint control","Log bps"],[
      ["Run with surface vector disabled",num(selected.same_weights_surface_disabled_log_bp,7)],
      ["Full minus disabled",num(selected.branch_disabling_difference_log_bp,7)]]);
    el("arch-readout").replaceChildren(...(table?[main,ablation,table]:[main,ablation]));
  }
}

function stageCount(){
  if(!current())return 0;
  return state.mode==="network"?state.network.stages.length:
    2+state.surface.fine.layers.length+state.surface.coarse.layers.length;
}

function render(){
  const data=current(),count=stageCount();
  el("arch-depth").max=Math.max(0,count-1);el("arch-depth").value=state.step;
  el("arch-depth").disabled=!count;el("arch-play").disabled=count<2;
  if(data){
    el("arch-stage-label").textContent=state.mode==="network"?networkInspector():surfaceInspector();
    readout();
    const r=data.run;
    el("arch-provenance").textContent=`${r.parameters.toLocaleString("en")} parameters · selected epoch ${r.epoch} · checkpoint ${r.checkpoint_sha256}.`;
    el("architecture-status").textContent="Recorded anchor "+(data.input.anchor_utc || data.input.frame_utc.at(-1))+" · native checkpoint replay";
  }
  paintScene();
}

function pause(){
  if(state.timer)clearInterval(state.timer);
  state.timer=null;
  el("arch-play").textContent="Play layers";
}
el("arch-play").addEventListener("click",()=>{
  if(state.timer){pause();return;}
  if(state.step===stageCount()-1)state.step=0;
  el("arch-play").textContent="Pause layers";
  render();
  state.timer=setInterval(()=>{
    if(state.step>=stageCount()-1){pause();return;}
    state.step+=1;render();
  },850);
});
el("arch-depth").addEventListener("input",event=>{pause();state.step=Number(event.target.value);render();});
el("arch-output").addEventListener("change",event=>{state.output=Number(event.target.value);readout();});
const traces={
  network:["horizons-deep-trace-v1.json","e4e118dca1e5af3cc7388ae3b4d437f6bad7e5317aada4a8e905c119594970ba"],
  surface:["horizons-surface-trace-v1.json","46e4dee37f2ab8f326115821b74d0a97a594f32ef71f94c7b098690493165c56"],
};
async function switchMode(mode){
  pause();
  state.mode=mode;state.step=0;state.channel=0;
  for(const key of Object.keys(traces))el("arch-"+key).setAttribute("aria-pressed",String(mode===key));
  try{
    if(!state[mode]){
      el("architecture-status").textContent="Loading the saved computation trace.";
      const [file,expectedHash]=traces[mode];
      const response=await fetch(file);
      if(!response.ok)throw new Error("Trace file missing");
      const bytes=await response.arrayBuffer();
      const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
      const actualHash=Array.from(hash,n=>n.toString(16).padStart(2,"0")).join("");
      if(actualHash!==expectedHash)throw new Error("Trace checksum changed");
      const trace=JSON.parse(new TextDecoder().decode(bytes));
      const expected=mode==="network"?"phaseweave.trained-horizon-trace.v1":"phaseweave.trained-surface-trace.v1";
      if(trace.format!==expected)throw new Error("Trace format changed");
      state[mode]=trace;
    }
    if(state.mode===mode)render();
  }catch{
    if(state.mode===mode)el("architecture-status").textContent="This saved trace is unavailable.";
  }
}
for(const mode of Object.keys(traces))el("arch-"+mode).addEventListener("click",()=>switchMode(mode));
function theme(value){
  document.documentElement.dataset.theme=value;
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeChoice===value)));
  try{localStorage.setItem("phaseweave-theme",value);}catch{}
  paintScene();
}
try{theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark");}catch{theme("dark");}
document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>theme(b.dataset.themeChoice)));
window.addEventListener("resize",paintScene);
switchMode(new URLSearchParams(location.search).get("mode")==="surface"?"surface":"network");
