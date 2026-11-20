"use strict";

(() => {
  const item = id => document.getElementById("surface-"+id);
  const tau = 2*Math.PI;
  const wrap = value => Math.atan2(Math.sin(value),Math.cos(value));
  let active, archive, visible, timer;
  const available = [2,3,4,5,6,7,8];
  const keys = ["text","muted","line","jade","copper","blue","violet"];
  function palette() {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(keys.map(color=>[color,style.getPropertyValue("--"+
      (color==="blue"||color==="violet"?"latent-":"")+color).trim()]));
  }
  const draw = Reasoning3D.bind(document.getElementById("latent-chart"),item("camera"),
    () => { if (visible) draw(visible,palette()); }, () => {});
  function options(select, entries) {
    select.replaceChildren(...entries.map(([name,value])=>new Option(name,value)));
  }
  function value(id) { return Number(item(id).value); }
  function onSurface() {
    active = SurfaceGenus.build(value("genus"));
    options(item("handle"),active.handles.map((_,i)=>[`Handle ${i+1}`,i]));
    render();
  }

  function panel(values) {
    const table = document.createElement("table");
    table.setAttribute("aria-label","Mesh and holonomy diagnostics");
    const tbody = table.createTBody();
    for(const [name,value] of values) {
      const row = tbody.insertRow();
      const key = document.createElement("th");
      key.scope="row";
      key.textContent=name;
      row.append(key);
      row.insertCell().textContent=value;
    }
    item("readout").replaceChildren(table);
  }

  function render() {
    if (!active || !archive) return;
    const data = archive[value("episode")].frames[value("frame")];
    item("clock").dateTime=data.utc;
    item("clock").textContent=data.utc.replace("T"," ").replace("+00:00"," UTC");
    const state = LatentReasoning.marketState(data);
    const {vertices,edges,faces,handles,chi,genus}=active;
    const loop=handles[value("handle")];
    const amplitude=value("scale")*(state.clockwise-0.3);
    const gauge=value("gauge"), edit=value("edit");
    const center=loop.center;
    const angle = ([x,y]) => Math.atan2(y-center[1],x-center[0]);
    const phase = ([x,y,z]) => gauge*Math.sin(.79*x+.61*y+.44*z);
    const special = loop.meridian.slice(0,2);
    function edgePhase(a,b) {
      const first=vertices[a], second=vertices[b];
      const sign = a===special[0]&&b===special[1]?1:a===special[1]&&b===special[0]?-1:0;
      return amplitude*wrap(angle(second)-angle(first))/tau+phase(second)-phase(first)+sign*edit;
    }
    const holonomy = path => wrap(path.reduce((sum,a,i)=>sum+edgePhase(a,path[(i+1)%path.length]),0));
    const flux=faces.map(holonomy);
    const high=Math.max(...flux.map(Math.abs));
    const mid=[0,1].map(i=>(Math.max(...vertices.map(p=>p[i]))+Math.min(...vertices.map(p=>p[i])))/2);
    const extent=Math.max(...vertices.map(p=>Math.max(Math.abs(p[0]-mid[0]),Math.abs(p[1]-mid[1]))));
    const point=([x,y,z])=>[(x-mid[0])/extent*2.45,z*.92,(y-mid[1])/extent*2.45];
    const coords=vertices.map(point);
    const overlay=path=>[...path,path[0]].map(id=>coords[id]);
    const points=[];
    const lines=edges.map(([a,b])=>({coords:[coords[a],coords[b]],color:"muted",width:.6,alpha:.29}));
    if (item("dessin").checked) {
      for (const coord of coords) points.push({point:coord,color:"muted",radius:1.05});
      for (const [a,b] of edges) {
        points.push({point:LatentReasoning.scale(LatentReasoning.add(coords[a],coords[b]),.5),color:"text",radius:1.6});
      }
    }
    for (const [path,color] of [[loop.meridian,"jade"],[loop.longitude,"copper"]]) {
      const route=overlay(path);
      lines.push({coords:route,color,width:3.3,arrow:true});
      route.slice(0,-1).forEach(p=>points.push({point:p,color:"text",radius:2.8}));
    }
    visible={axes:["Surface x","Sheet height","Surface y"],grid:false,points,lines,
      faces:faces.map((face,i)=>({coords:face.map(id=>coords[id]),color:Math.abs(flux[i])>1e-7?"violet":"blue",
        alpha:Math.abs(flux[i])>1e-7?.55:.23}))};
    draw(visible,palette());
    const places = item("dessin").checked;
    panel([["Genus",genus],["Graph vertices",places?vertices.length+edges.length:vertices.length],
      ["Graph edges",places?2*edges.length:edges.length],["Disk faces",faces.length],["Euler characteristic",chi],
      ["First homology rank",2*genus],["Local maximum face phase",`${high.toExponential(2)} rad`],
      ["Nonzero face phases",flux.filter(v=>Math.abs(v)>1e-7).length],
      ["Winding-loop phase",`${holonomy(loop.meridian).toFixed(5)} rad`],
      ["Companion-loop phase",`${holonomy(loop.longitude).toFixed(5)} rad`]]);
  }

  function theme(mode) {
    document.documentElement.dataset.theme=mode;
    document.querySelectorAll("[data-theme-value]").forEach(button=>
      button.setAttribute("aria-pressed",String(button.dataset.themeValue===mode)));
    try { localStorage.setItem("phaseweave-theme",mode); } catch {}
    if (visible) draw(visible,palette());
  }
  try { theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark"); } catch {}
  document.querySelectorAll("[data-theme-value]").forEach(button=>
    button.addEventListener("click",()=>theme(button.dataset.themeValue)));
  options(item("genus"),available.map(n=>[n,n]));
  item("genus").value="3";
  item("genus").addEventListener("change",onSurface);
  for (const name of ["frame","handle","scale","gauge","edit","dessin"]) item(name).addEventListener("input",render);
  item("episode").addEventListener("change",()=>{
    item("frame").value=0;
    item("frame").max=archive[value("episode")].frames.length-1;
    render();
  });
  item("play").addEventListener("click",()=>{
    if (timer) {
      clearInterval(timer);
      timer=null;
    } else {
      timer=setInterval(()=>{
        item("frame").value=(value("frame")+1)%(Number(item("frame").max)+1);
        render();
      },400);
    }
    item("play").setAttribute("aria-pressed",String(Boolean(timer)));
    item("play").textContent=timer?"Pause recorded seconds":"Play recorded seconds";
  });
  new ResizeObserver(()=>{if(visible) draw(visible,palette());}).observe(document.getElementById("latent-chart"));
  fetch("replay.json").then(response=>{
    if(!response.ok) throw new Error("archive unavailable");
    return response.json();
  }).then(episodes=>{
    archive=episodes;
    options(item("episode"),archive.map((episode,i)=>[episode.label,i]));
    item("frame").max=archive[0].frames.length-1;
    onSurface();
  }).catch(()=>{item("status").textContent="The surface or recorded quote windows could not load.";});
})();
