"use strict";

(() => {
  const item = id => document.getElementById("ribbon-" + id);
  const tau = 2 * Math.PI;
  const phases = ["text","muted","line","jade","copper","blue","violet"];
  let assets, archive, scene, timer;
  const draw = Reasoning3D.bind(document.getElementById("latent-chart"),item("camera"),redraw,()=>{});
  const mod = value => ((value % 3) + 3) % 3;
  const wrap = value => Math.atan2(Math.sin(value),Math.cos(value));
  const total = (walk, field) => walk.reduce((sum,[edge,sign])=>sum+sign*field[edge],0);

  function redraw() {
    if (!scene) return;
    const styles = getComputedStyle(document.documentElement);
    const palette = Object.fromEntries(phases.map(color=>[color,styles.getPropertyValue(
      (color==="blue"||color==="violet"?"--latent-":"--")+color).trim()]));
    draw(scene,palette);
  }

  function choices(node, values) {
    node.replaceChildren(...values.map(([label,value])=>new Option(label,value)));
  }

  function selected() {
    return assets.examples[item("size").value];
  }

  function walkChoices() {
    const listed = selected().embeddings[item("rotation").value];
    choices(item("walk"), [
      ...listed.cycles.map((_,i)=>["Basis cycle "+(i+1),"c"+i]),
      ...listed.faces.map((_,i)=>["Face "+(i+1),"f"+i]),
    ]);
  }

  function market(episode, end=Number(item("frame").value)) {
    const indices=[0,4,8,15].map(step=>end-15+step);
    const frames=indices.map(index=>episode.frames[index]);
    if (!frames.every(frame=>frame && frame.edges.length===6 &&
      frame.edges.every(edge=>Number.isFinite(edge.bps) && Number.isFinite(edge.age) && edge.age>=0 && edge.age<=250))) return null;
    const endTime=Date.parse(frames.at(-1).utc);
    if (!Number.isFinite(endTime) || frames.some((frame,i)=>Date.parse(frame.utc)!==endTime-1000*(end-indices[i]))) return null;
    return frames.map(frame=>LatentReasoning.marketState(frame).skew);
  }

  function render() {
    if (!assets) return;
    const spec=selected();
    const size=Number(item("size").value), gauge=Number(item("gauge").value);
    const embedding=spec.embeddings[item("rotation").value];
    const fx=item("input").value==="fx";
    const current=fx ? archive[Number(item("episode").value)] : null;
    const samples=current ? market(current) : null;
    const base=fx ? (samples && [...Array(6).fill(0),...samples.map(sample=>sample*.5)]) : [1,...Array(2*size-1).fill(0)];
    const vertexPhase=index=> fx ? gauge*Math.sin(index+.6) : gauge*(index*index+2*index);
    const active=base && spec.edges.map(([a,b],i)=>base[i]+vertexPhase(b)-vertexPhase(a));
    const format=fx ? x=>wrap(x).toFixed(5)+" rad" : x=>String(mod(x));
    const scalar=walk=>active ? format(total(walk,active)) : "Unavailable";
    const residual=active && [...embedding.faces,...embedding.cycles].reduce((high,walk)=>{
      const left=total(walk,base), right=total(walk,active);
      const error=fx ? 2*Math.abs(Math.sin((right-left)/2)) : mod(right-left);
      return Math.max(high,error);
    },0);
    const points=[[-1.45,0,0],[1.45,0,0],...Array.from({length:size},(_,i)=>{
      const angle=tau*i/size;
      return [0,Math.sin(angle),Math.cos(angle)];
    })];
    const index=Number(item("walk").value.slice(1));
    const path=(item("walk").value.startsWith("f")? embedding.faces : embedding.cycles)[index];
    const overlay=path.map(([edge,sign])=>points[spec.edges[edge][sign===1?0:1]]);
    overlay.push(overlay[0]);
    scene={axes:[],grid:false,minExtent:1.7,points:points.map((point,i)=>({point,radius:i<2?6:4,
      label:i<2?["u","v"][i]:"w"+(i-2),color:i<2?"text":"blue"})),faces:[],
      lines:[...spec.edges.map(([a,b])=>({coords:[points[a],points[b]],color:"muted",alpha:.45,width:1})),
        {coords:overlay,color:"jade",alpha:1,width:3,arrow:true}]};
    redraw();
    item("clock").textContent=fx ? current.frames[Number(item("frame").value)].utc.replace("T"," ").replace("+00:00"," UTC") : "Exact ternary witness";
    item("note").textContent=fx && !base ? "The requested four-frame FX lift is unavailable at the 250 ms freshness limit." :
      fx ? "Input triangle margins · "+samples.map(x=>x.toFixed(5)).join(" / ")+" log bp" : "The first edge has exponent 1 modulo 3 in the base connection.";
    const entries=[
      ["Genus",embedding.genus],["Disk faces",embedding.faces.length],
      ["Independent periods",embedding.cycles.length],
      ["Face circulation",embedding.faces.map(scalar).join(" / ")],
      ["Wilson periods",embedding.cycles.map(scalar).join(" / ") || "None"],
      ["Selected walk",scalar(path)],
      ["Maximum rephasing error",active ? (fx?residual.toExponential(2):String(residual)) : "Unavailable"],
    ];
    const rows=item("report");
    rows.replaceChildren();
    for (const [label,value] of entries) {
      const row=rows.insertRow();
      const title=document.createElement("th");
      title.scope="row";
      title.textContent=label;
      row.append(title);
      row.insertCell().textContent=String(value);
    }
  }

  function togglePlayback() {
    if (timer) {
      clearInterval(timer);
      timer=null;
    } else {
      timer=setInterval(()=>{
        const frame=item("frame");
        frame.value=Number(frame.value)>=Number(frame.max)?frame.min:Number(frame.value)+1;
        render();
      },400);
    }
    item("play").setAttribute("aria-pressed",String(Boolean(timer)));
    item("play").textContent=timer?"Pause recorded frames":"Play recorded frames";
  }

  function pickReplayOrigin() {
    const episode=archive[Number(item("episode").value)];
    item("frame").max=episode.frames.length-1;
    item("frame").value=15;
    for (let target=15; target<episode.frames.length; target++) {
      if (market(episode,target)) {
        item("frame").value=target;
        break;
      }
    }
  }

  function config() {
    const fx=item("input").value==="fx";
    if (!fx && timer) togglePlayback();
    item("size").disabled=fx;
    if (fx) item("size").value="5";
    item("replay").hidden=!fx;
    item("frame").max=archive[Number(item("episode").value)].frames.length-1;
    walkChoices();
    render();
  }

  function theme(name) {
    document.documentElement.dataset.theme=name;
    document.querySelectorAll("[data-scheme]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn.dataset.scheme===name)));
    try { localStorage.setItem("phaseweave-theme",name); } catch {}
    redraw();
  }

  try { theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark"); } catch {}
  document.querySelectorAll("[data-scheme]").forEach(btn=>btn.onclick=()=>theme(btn.dataset.scheme));
  new ResizeObserver(redraw).observe(document.getElementById("latent-chart"));

  async function load(url) {
    const reply=await fetch(url);
    if (!reply.ok) throw Error("Ribbon data unavailable");
    return reply.json();
  }

  load("ribbon-fx-results-v1.json").then(result => {
    if (result.schema!=="phaseweave.ribbon-fx.v1") throw Error("Invalid forecast result");
    const labels = {"raw-ridge":"Raw graph ridge","genus-two-u1":"Genus-two Wilson phase",
      "planar-u1":"Planar face phase","genus-two-tanh":"Genus-two tanh control"};
    choices(item("horizon"),result.identity.horizons_s.map(value=>[value+" seconds",value]));
    const digits = value=>Number(value).toFixed(6);
    function labelInterval(interval) {
      return "["+digits(interval.lower_95)+", "+digits(interval.upper_95)+"]";
    }
    function renderResults() {
      const split = result.splits[item("split").value];
      const horizon = item("horizon").value;
      const body = item("scores");
      body.replaceChildren();
      for (const name of Object.keys(labels)) {
        const score = split.scores[name][horizon];
        const row=body.insertRow();
        const title=document.createElement("th");
        title.scope="row";
        title.textContent=labels[name];
        row.append(title);
        for (const value of [digits(score.mae_bps),digits(score.delta_to_raw_ridge_bps),
          labelInterval(score.paired_utc_day_interval)]) row.insertCell().textContent=value;
      }
      const actual = split.scores["raw-ridge"][horizon].rows;
      item("results").textContent=actual.toLocaleString("en-US")+" scored windows at this horizon. "+
        split.complete_input_phase_rows.toLocaleString("en-US")+" of "+split.rows.toLocaleString("en-US")+
        " windows in this split have all four required input frames.";
      const paired = split.genus_two_minus_planar_u1[horizon];
      item("paired").textContent="Genus-two Wilson minus planar face MAE · "+digits(paired.delta_bps)+
        " log bp · paired 95% interval "+labelInterval(paired.utc_day_interval)+". Negative favors the genus-two representation.";
    }
    item("split").onchange=renderResults;
    item("horizon").onchange=renderResults;
    renderResults();
  }).catch(()=>{item("results").textContent="The measured comparison is unavailable.";});

  Promise.all([load("ribbon-basis-v1.json"),load("replay.json")]).then(([basis,quotes])=>{
    if (basis.schema!=="phaseweave.ribbon-basis.v1") throw Error("Invalid ribbon basis");
    assets=basis;
    archive=quotes;
    choices(item("episode"),archive.map((episode,i)=>[episode.label,i]));
    ["size","rotation"].forEach(id=>item(id).onchange=config);
    item("input").onchange=()=>{if(item("input").value==="fx") pickReplayOrigin(); config();};
    ["walk","gauge","frame"].forEach(id=>item(id).oninput=render);
    item("episode").onchange=()=>{pickReplayOrigin();config();};
    item("play").onclick=togglePlayback;
    config();
  }).catch(()=>{item("note").textContent="Couldn't load the signed ribbon walks or replay frames.";});
})();
