"use strict";
const byId = id => document.getElementById(id);
const put = (id,text) => {byId(id).textContent=text};
const element = (tag,text) => {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const num = n => n.toFixed(6);
function table(id,rows){
  byId(id).replaceChildren(...rows.map(row=>{
    const tr=element("tr");
    row.forEach(v=>tr.append(element("td",v)));
    return tr;
  }));
}

function render(data){
  const {walk,forest,language}=data;
  if(data.schema!=="phaseweave-output-evidence-v1")throw Error("Unknown evidence schema");
  const densityRows=walk.assets.map(asset=>{
    const row=element("div");row.className="density-row";
    const meter=element("meter");meter.min=0;meter.max=1;meter.setAttribute("aria-label",asset+" site probability");
    const value=element("span");row.append(element("b",asset),meter,value);byId("densities").append(row);
    return {meter,value};
  });
  function frame(){
    const index=+byId("frame").value, state=walk.states[index];
    put("clock",state.utc+" · frame "+(index+1)+"/"+walk.states.length);
    densityRows.forEach(({meter,value},i)=>{meter.value=state.density[i];value.textContent=(100*meter.value).toFixed(2)+"%";});
    table("links",state.links.map((link,i)=>[walk.assets[i]+" → "+walk.assets[(i+1)%3],link.rate===null?"Unavailable":num(link.rate),link.age===null?"Unavailable":link.age+" ms",(link.active?"":"Closed · ")+num(state.flux[i])]));
    put("conserve","Total probability "+state.density.reduce((a,b)=>a+b,0).toFixed(12)+" · maximum local continuity residual "+Math.max(...state.residual.map(Math.abs)).toExponential(2));
  }
  byId("frame").max=walk.states.length-1;byId("frame").addEventListener("input",frame);frame();
  const nodes=new Map(forest.nodes.map(n=>[n.id,n]));
  forest.ranked.forEach((r,i)=>{const option=element("option",String(i+1)+". Tree "+(r.tree+1)+" · score "+num(r.terminal_score));option.value=String(i);byId("winner").append(option);});
  function path(){
    const ranked=forest.ranked[+byId("winner").value];
    table("path",ranked?ranked.path.map(id=>{const n=nodes.get(id);return [n.depth,n.label,...n.point.map(num),num(n.score)];}):[]);
  }
  byId("winner").disabled=!forest.ranked.length;byId("winner").addEventListener("change",path);path();
  put("forecast",(forest.abstained?"The forest abstained. ":"The coordinatewise median combined "+forest.ranked.length+" eligible tree votes. ")+"The one-second forecast returned forward and reverse margins of "+forest.forecast_log_bps.map(num).join(" and ")+" log bp. Changes from the anchor were "+forest.forecast_delta_log_bps.map(num).join(" and ")+" log bp.");
  put("forest-meta","8-root, 4-expansion, branching-factor-3 checkpoint after 4,096 training updates. Run "+forest.started_utc+" to "+forest.finished_utc+". "+forest.scored+" candidates scored.");
  forest.events.forEach(e=>byId("events").append(element("li",e.stage+(e.depth!==undefined?" · depth "+e.depth:"")+(e.evaluated!==undefined?" · "+e.evaluated+" evaluated":"")+" · "+e.receipt_ms+" ms after start")));
  const chunks=language.chunks;let timer=null;
  function stop(){clearTimeout(timer);timer=null;put("play","Replay answer");}
  function display(){
    const count=+byId("chunk").value;const last=chunks[count-1];
    put("answer",chunks.slice(0,count).map(c=>c.content).join(""));
    put("progress",count+" / "+chunks.length);
    put("text-time",last?"Emitted "+last.emitted_utc+" · received "+last.receipt_ms+" ms after the request.":"Before first content chunk.");
  }
  function advance(){
    const next=+byId("chunk").value+1;
    if(next>chunks.length){stop();return;}
    byId("chunk").value=next;display();
    if(next===chunks.length){stop();return;}
    timer=setTimeout(advance,Math.max(0,chunks[next].receipt_ms-chunks[next-1].receipt_ms));
  }
  byId("chunk").max=chunks.length;byId("chunk").value=chunks.length;display();
  byId("chunk").addEventListener("input",()=>{stop();display();});
  byId("play").addEventListener("click",()=>{if(timer!==null){stop();return;}byId("chunk").value=0;display();put("play","Stop playback");advance();});
  put("scoreable","The next frame at "+walk.next_target.utc+" contains "+walk.next_target.stale_edges.map(e=>e.from+" → "+e.to+" ("+e.age+" ms)").join(" and ")+". The "+walk.next_target.age_cap_ms+" ms freshness rule excludes this target from forecast-error scoring.");
  put("model-meta",language.model+" · "+language.eval_count+" model-reported generation tokens · "+language.started_utc+" to "+language.finished_utc+". Playback begins at the first content chunk. Digest "+language.digest);
  put("prompt",language.messages.map(m=>m.role+"\n"+m.content).join("\n\n"));
  byId("load").hidden=true;byId("exhibit").hidden=false;
}
fetch("output-evidence-v1.json").then(r=>{if(!r.ok)throw Error("Receipt unavailable");return r.json();}).then(render).catch(e=>put("load","Could not display the inference receipt. "+e.message));
