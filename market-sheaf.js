"use strict";

const MarketSheaf = (() => {
  const key = pair => pair.join("-");
  const sign = pair => key(pair) === "0-2" ? -1 : 1;

  function fit(markets, options) {
    const {source, excluded, weighted, ageScale, fee} = options;
    const cells = markets.map(cell => {
      let state = cell.state;
      if (state === "fresh" && (!source || excluded.has(key(cell.pair)))) {
        state = source ? "withheld_pair" : "withheld_source";
      }
      const value = cell.value_log_bps;
      const weight = state === "fresh" ? (weighted ? Math.exp(-cell.age_ms/ageScale) : 1) : null;
      return {...cell,state,weight,observed:value?.[0],fitted:null,residual:null};
    });
    const active = cells.filter(cell => cell.weight !== null);
    const complete = active.length === 3;
    const cycle = complete ? active.reduce((sum,cell) => sum+sign(cell.pair)*cell.observed,0) : null;
    const spread = complete ? active.reduce((sum,cell)=>sum+cell.value_log_bps[1],3*fee) : null;
    const inverseWeight = active.reduce((sum,cell)=>sum+1/cell.weight,0);
    for (const cell of active) {
      cell.residual = complete ? cycle*sign(cell.pair)/cell.weight/inverseWeight : 0;
      cell.fitted = cell.observed-cell.residual;
    }
    const totalWeight = active.reduce((sum,c)=>sum+c.weight,0);
    const rms = active.length ? Math.sqrt(active.reduce((sum,c)=>sum+c.weight*c.residual**2,0)/(2*totalWeight)) : null;
    const rank = complete ? 5 : 2*active.length;
    return {cells,active:active.length,rank,h0:6-rank,h1:2*active.length-rank,rms,cycle,
            raw:complete?[cycle-spread,-cycle-spread]:null,
            projected:complete?[-spread,-spread]:null,
            homogeneous:new Set(active.map(cell=>cell.age_ms)).size===1};
  }

  return {fit,key};
})();

if (typeof module !== "undefined") module.exports = MarketSheaf;

if (typeof document !== "undefined") (() => {
  const $ = name => document.getElementById("sheaf-"+name);
  const BYTES_HASH = "2d33a21bf305f5aea234ea12355d00b8a6d3d19a049e241157c95c980427e47f";
  const names = {fresh:"Included",stale:"Stale",missing:"No prior quote",non_market:"Non-market",
                 withheld_pair:"Withheld pair",withheld_source:"Withheld source"};
  const themeButtons = [...document.querySelectorAll("[data-sheaf-theme]")];
  const state = {data:null,frame:null,result:null,excluded:new Set()};
  const number = value => Number.isFinite(value) ? value.toFixed(5) : "—";
  function addText(parent, tag, content) {
    const node = document.createElement(tag);
    node.textContent = content;
    parent.append(node);
    return node;
  }

  function draw() {
    if (!state.result) return;
    const canvas = $("canvas");
    const {width,height} = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio||1,2);
    canvas.width = width*ratio; canvas.height = height*ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio,ratio);
    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue("--"+name).trim();
    const inset = width*.18;
    const xy = [[width/2,height*.20],[width-inset,height*.75],[inset,height*.75]];
    ctx.font = "13px ui-monospace, monospace";
    ctx.lineCap = "round";
    for (const edge of state.result.cells) {
      const [[ax,ay],[bx,by]] = edge.pair.map(i=>xy[i]);
      const tone = edge.state==="fresh" ? "jade" : edge.state==="stale" ? "copper" : "muted";
      ctx.strokeStyle = color(tone);
      ctx.globalAlpha = edge.state==="fresh" ? .92 : .52;
      ctx.lineWidth = edge.state==="fresh" ? 2.6 : 1.4;
      ctx.setLineDash(edge.state==="fresh" ? [] : [4,5]);
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
      ctx.setLineDash([]);
      if (edge.state==="fresh") {
        const tip = [.55*bx+.45*ax,.55*by+.45*ay];
        const theta = Math.atan2(by-ay,bx-ax);
        ctx.beginPath();ctx.moveTo(tip[0]-8*Math.cos(theta-.55),tip[1]-8*Math.sin(theta-.55));
        ctx.lineTo(...tip);ctx.lineTo(tip[0]-8*Math.cos(theta+.55),tip[1]-8*Math.sin(theta+.55));ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const [i,[x,y]] of xy.entries()) {
      ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);
      ctx.fillStyle = color("canvas");ctx.fill();
      ctx.strokeStyle = color("line");ctx.lineWidth = 1.5;ctx.stroke();
      const label = state.frame.assets[i];
      ctx.fillStyle = color("text");
      ctx.fillText(label,x-ctx.measureText(label).width/2,y+4);
    }
  }

  function analyze() {
    const observation = state.data.episodes[Number($("episode").value)];
    state.frame = observation.frames[Number($("frame").value)];
    const frame = state.frame;
    const result = MarketSheaf.fit(frame.markets,{
      source:$("source").checked, excluded:state.excluded, weighted:$("weight").value==="age",
      ageScale:state.data.age_scale_ms,fee:state.data.fee_per_leg_log_bps,
    });
    state.result = result;
    $("time").textContent = frame.utc.replace("T"," ").replace("+00:00"," UTC") + " · " + observation.source;
    $("active").textContent = result.active;
    $("rank").textContent = result.rank;
    $("h0").textContent = result.h0;
    $("h1").textContent = result.h1;
    $("rms").textContent = result.rms === null ? "Unavailable" : number(result.rms) + " log bps";
    $("weight-note").textContent = result.active && result.homogeneous ?
      "The included quotes share a recorded age. Age decay and uniform weights give the same fit." : "";
    $("cycle").textContent = result.cycle===null ? "A complete loop requires three fresh included pairs."
      : `Observed midpoint circulation ${number(result.cycle)} log bps. The projected circulation is zero.`;
    $("margin").textContent = result.raw ? `Indicative margins at 0.1 log bps per leg · observed ${result.raw.map(number).join(" / ")} · fitted ${result.projected.map(number).join(" / ")}` : "";
    $("status").textContent = `Observed quote cutoff ${state.data.freshness_ms} ms`;
    const table = $("readout");
    table.replaceChildren();
    for (const cell of result.cells) {
      const row = table.insertRow();
      addText(row,"th",cell.pair.map(i=>frame.assets[i]).join("/")).scope="row";
      [names[cell.state],cell.age_ms ?? "—",number(cell.weight),number(cell.observed),
       number(cell.fitted),number(cell.residual)].forEach(value=>addText(row,"td",value));
    }
    draw();
  }

  function pickEpisode() {
    const episode = state.data.episodes[Number($("episode").value)];
    const frames = episode.frames.map(({frame,utc},i)=>new Option(`Frame ${frame} · ${utc.slice(11,19)} UTC`,i));
    $("frame").replaceChildren(...frames);
    const legend = $("mask").querySelector("legend");
    $("mask").replaceChildren(legend);
    const sample = episode.frames[0];
    for (const cell of sample.markets) {
      const input = document.createElement("input");
      const id = MarketSheaf.key(cell.pair);
      input.type="checkbox";
      input.checked=!state.excluded.has(id);
      input.addEventListener("change",()=>{
        if (input.checked) state.excluded.delete(id); else state.excluded.add(id);
        analyze();
      });
      const label=document.createElement("label");
      label.append(input,cell.pair.map(i=>sample.assets[i]).join("/"));
      $("mask").append(label);
    }
    analyze();
  }

  function theme(name) {
    document.documentElement.dataset.theme=name;
    themeButtons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.sheafTheme===name)));
    try {localStorage.setItem("phaseweave-theme",name);} catch {}
    draw();
  }
  themeButtons.forEach(button=>button.addEventListener("click",()=>theme(button.dataset.sheafTheme)));
  try { theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark"); } catch {}
  $("episode").addEventListener("change",pickEpisode);
  for (const control of ["frame","weight","source"]) $(control).addEventListener("change",analyze);
  new ResizeObserver(draw).observe($("canvas"));
  fetch("market-sheaf-replay-v1.json").then(async response=>{
    if (!response.ok) throw new Error("Missing observed quotes");
    const bytes = await response.arrayBuffer();
    const raw = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const hash = Array.from(raw,b=>b.toString(16).padStart(2,"0")).join("");
    if (hash!==BYTES_HASH) throw new Error("Observed quote digest mismatch");
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if (data.format!=="phaseweave.market-sheaf.v1") throw new Error("Observed quote schema mismatch");
    state.data=data;
    $("episode").replaceChildren(...data.episodes.map((item,i)=>new Option(item.label,i)));
    for (const control of ["episode","frame","weight","source","mask"]) $(control).disabled=false;
    pickEpisode();
  }).catch(()=>{ $("status").textContent = "The verified quote replay could not be loaded."; });
})();
