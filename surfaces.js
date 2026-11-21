"use strict";

(() => {
  const item = id => document.getElementById("surface-"+id);
  const tau = 2*Math.PI;
  const wrap = value => Math.atan2(Math.sin(value),Math.cos(value));
  let active, geometry, visible, timer, feed, lastId;
  let display = null, archive = [], live = [], recordedIndex = 0;
  let packet=null, oldGauge=0, evolvedFrame=null, densityStep=0, cachedDensity=new WeakMap();
  let densityCoordinates=[], basePoints=[], beforeDensity, afterDensity, densityStart, transition=0;
  const gaugeAt=(scale, [x,y,z])=>scale*Math.sin(.79*x+.61*y+.44*z);
  const params = new URLSearchParams(location.search);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const available = Array.from({length:SurfaceGenus.MAX_GENUS},(_,i)=>i+1);
  const keys = ["text","muted","line","jade","copper","blue","violet"];
  function palette() {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(keys.map(color=>[color,style.getPropertyValue("--"+
      (color==="blue"||color==="violet"?"latent-":"")+color).trim()]));
  }
  const draw = Reasoning3D.bind(document.getElementById("latent-chart"),item("camera"),
    () => { if (visible) draw(visible,palette()); }, () => {}, {yaw:-22,pitch:43});
  function options(select, entries) {
    select.replaceChildren(...entries.map(([name,value])=>new Option(name,value)));
  }
  function value(id) { return Number(item(id).value); }
  function onSurface() {
    active = SurfaceGenus.build(value("genus"));
    resetDensity();
    const previous = value("handle");
    options(item("handle"),active.handles.map((_,i)=>[`Handle ${i+1}`,i]));
    item("handle").value = Math.min(previous, active.handles.length - 1);
    selectGeometry();
  }
  function selectGeometry() {
    geometry = item("geometry").value==="rounded" ? SurfaceGenus.rounded(active,active.genus<=3?2:1) : {
      ...active, parents:active.faces.map((_,i)=>i), path:(a,b)=>[a,b],
    };
    item("title").textContent=item("geometry").value==="rounded" ? "Rounded surface and oriented cycles" : "Cubical surface and oriented cycles";
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

  function resetDensity() {
    packet=null; evolvedFrame=null; densityStep=0; cachedDensity=new WeakMap();
  }

  function densityPaint(alpha) {
    if(!visible) return;
    if(!item("cloud").checked || !afterDensity) {
      visible.points=basePoints;
      draw(visible,palette());
      return;
    }
    const type=item("channel").value, radius=value("radius"), sprites=[];
    const interpolate=(a,b)=>a+(b-a)*alpha;
    const candidates=afterDensity.map((parts,i)=>{
      const channels=parts.map((p,j)=>interpolate(beforeDensity?.[i]?.[j]??p,p));
      return {i,channels,total:channels.reduce((sum,p)=>sum+p,0)};
    }).filter(x=>x.total>1e-4).sort((a,b)=>b.total-a.total).slice(0,85);
    for (const {i,channels,total} of candidates) {
      const origin=densityCoordinates[i];
      const append=(weight,color,lift)=>{
        if (weight<8e-5) return;
        const size=Math.min(20,2.8+33*Math.sqrt(weight))*radius;
        sprites.push({point:[origin[0],origin[1]+lift,origin[2]],cloud:size,color,
          radius:0,alpha:Math.min(.92,.12+4*Math.sqrt(weight))});
      };
      if (type==="channels") channels.forEach((part,j)=>append(part,["jade","copper","violet"][j],(j-1)*.075));
      if (type==="total") append(total,"jade",.035);
      if (type==="signed") {
        const signed=channels[0]-channels[1];
        append(Math.abs(signed),signed>=0?"jade":"copper",.035);
      }
    }
    visible.points=[...basePoints,...sprites];
    draw(visible,palette());
  }

  function animateDensity(playing) {
    cancelAnimationFrame(transition);
    if (!playing || reducedMotion || !item("cloud").checked) { densityPaint(1); return; }
    const duration=Math.min(700,value("interval")*.94);
    let previousDraw=-Infinity;
    function animate(t) {
      const f=Math.min(1,(t-densityStart)/duration);
      if (t-previousDraw>=85 || f===1) { densityPaint(Math.max(0,f)); previousDraw=t; }
      if(f<1) transition=requestAnimationFrame(animate);
    }
    transition=requestAnimationFrame(animate);
  }

  function render() {
    if (!active) return;
    const data = display?.frame;
    item("clock").dateTime = data?.utc ?? "";
    item("clock").textContent = data ? new Date(data.utc).toISOString().replace("T"," ").replace("Z"," UTC") : "Waiting for quote time";
    if (display && item("status").textContent !== display.status) item("status").textContent = display.status;
    const fee=value("fee");
    const validFee=Number.isFinite(fee) && fee >= 0 && fee <= 100 ? fee : 10;
    const [forward,reverse] = data ? PhaseWeave.replay(data,data.assets?5000:2500,validFee).scored : [];
    const signedMargin=forward?.score;
    const {vertices,edges,faces,handles,chi,genus}=active;
    const loop=handles[value("handle")];
    const amplitude=Number.isFinite(signedMargin)?value("scale")*Math.tanh(signedMargin/40):0;
    const gauge=value("gauge"), edit=value("edit");
    const center=loop.center;
    const angle = ([x,y]) => Math.atan2(y-center[1],x-center[0]);
    const phase = vertex => gaugeAt(gauge,vertex);
    const special = loop.meridian.slice(0,2);
    function edgePhase(a,b) {
      const first=vertices[a], second=vertices[b];
      const sign = a===special[0]&&b===special[1]?1:a===special[1]&&b===special[0]?-1:0;
      return amplitude*wrap(angle(second)-angle(first))/tau+phase(second)-phase(first)+sign*edit;
    }
    const holonomy = path => wrap(path.reduce((sum,a,i)=>sum+edgePhase(a,path[(i+1)%path.length]),0));
    let evolved=false;
    if (!packet) {
      packet=SurfaceDensity.initialize(vertices,vertices[loop.meridian[0]],phase,1.2);
      oldGauge=gauge;
      beforeDensity=SurfaceDensity.densities(packet);
    }
    if (oldGauge!==gauge) {
      const delta=gauge-oldGauge;
      packet=SurfaceDensity.gaugeChange(packet,vertices,vertex=>gaugeAt(delta,vertex));
      oldGauge=gauge;
    }
    if (data && data!==evolvedFrame && timer) {
      beforeDensity=SurfaceDensity.densities(packet);
      packet=SurfaceDensity.step(packet,edges,edgePhase,value("mixing"));
      densityStep++;
      cachedDensity.set(data,{packet,gauge,densityStep});
      evolvedFrame=data;
      densityStart=performance.now();
      evolved=true;
    }
    afterDensity=SurfaceDensity.densities(packet);
    const flux=faces.map(holonomy);
    const high=Math.max(...flux.map(Math.abs));
    const mid=[0,1].map(i=>(Math.max(...vertices.map(p=>p[i]))+Math.min(...vertices.map(p=>p[i])))/2);
    const extent=Math.max(...vertices.map(p=>Math.max(Math.abs(p[0]-mid[0]),Math.abs(p[1]-mid[1]))));
    const roundedView=item("geometry").value==="rounded";
    const point=([x,y,z])=>{
      // Expand disjoint hole neighborhoods with a monotonically increasing radial map.
      if (roundedView) for (const {center:[cx,cy]} of handles) {
        const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy);
        if (r===0 || r>=1.9) continue;
        const bump=.56*(r<=.71 ? r/.71 : (1.9-r)/(1.9-.71));
        x+=bump*dx/r; y+=bump*dy/r;
        break;
      }
      return [(x-mid[0])/extent*2.45,(z-.5)*1.12,(y-mid[1])/extent*2.45];
    };
    const coords=geometry.vertices.map(point);
    densityCoordinates=coords.slice(0,vertices.length);
    const overlay=path=>[...path,path[0]].map(id=>coords[id]);
    const places = item("dessin").checked;
    const points=[];
    const lines = places || item("geometry").value==="cells" ? edges.map(([a,b])=>({
      coords:geometry.path(a,b).map(id=>coords[id]), color:"muted",width:.6,alpha:.35,
    })) : [];
    if (places) {
      for (const coord of coords.slice(0,vertices.length)) points.push({point:coord,color:"muted",radius:1.05});
      for (const [a,b] of edges) {
        const path=geometry.path(a,b);
        const middle=path.length>2 ? coords[path[Math.floor(path.length/2)]] : LatentReasoning.scale(LatentReasoning.add(coords[a],coords[b]),.5);
        points.push({point:middle,color:"text",radius:1.6});
      }
    }
    const visualLoop=geometry.handles[value("handle")];
    for (const [path,color] of [[visualLoop.meridian,"jade"],[visualLoop.longitude,"copper"]]) {
      const route=overlay(path);
      lines.push({coords:route,color,width:3.3,arrow:true});
      path.filter(id=>id<vertices.length).forEach(id=>points.push({point:coords[id],color:"text",radius:2.35}));
    }
    visible={axes:[],grid:false,minExtent:2.45,framingScale:.42,points,lines,
      faces:geometry.faces.map((face,i)=>{
        const curved=face.map(id=>coords[id]);
        const d1=curved[1].map((x,j)=>x-curved[0][j]), d2=curved[3].map((x,j)=>x-curved[0][j]);
        const normal=d1.map((_,j)=>d1[(j+1)%3]*d2[(j+2)%3]-d1[(j+2)%3]*d2[(j+1)%3]);
        const light=(.4*normal[0]+.75*normal[1]+.49*normal[2])/(Math.hypot(...normal)||1);
        const changed=Math.abs(flux[geometry.parents[i]])>1e-7;
        return {coords:curved,color:changed?"violet":"blue",alpha:changed?.95:.42+.28*light};
      })};
    basePoints=points;
    animateDensity(evolved);
    const route=row=>row?.score == null ? "Unavailable" : `${row.label} · ${row.score.toFixed(3)} bps`;
    panel([["Genus",genus],["Forward quote margin",route(forward)],["Reverse quote margin",route(reverse)],
      ["Graph vertices",places?vertices.length+edges.length:vertices.length],
      ["Graph edges",places?2*edges.length:edges.length],["Disk faces",faces.length],["Euler characteristic",chi],
      ["First homology rank",2*genus],["Density step",densityStep],
      ["Amplitude norm",SurfaceDensity.norm(packet).toFixed(10)],["Local maximum face phase",`${high.toExponential(2)} rad`],
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
  const source = () => item("episode").value;
  const liveSource = () => GateSpotSources.has(source());
  function frameSlider(last,index) {
    item("frame").max=Math.max(0,last);
    item("frame").value=index;
  }
  function recorded(index, status) {
    const sample=archive[index];
    if (!sample) return;
    recordedIndex=(recordedIndex+1)%sample.frames.length;
    frameSlider(sample.frames.length-1,recordedIndex);
    display={frame:sample.frames[recordedIndex],status};
  }
  function advance() {
    if (liveSource()) {
      const snap=GateSpotSources.snapshot(feed,5000);
      if (snap) {
        if (snap.id!==lastId) {
          lastId=snap.id;
          live.push(snap.frame);
          if (live.length>120) live.shift();
        }
        frameSlider(live.length-1,live.length-1);
        display={frame:live.at(-1),status:snap.frame.source+" · "+snap.frame.assets.join(" / ")+" · live quotes"};
      } else if (archive.length) {
        recorded(0,"Live quotes incomplete or stale · playing recorded FX evidence");
      } else {
        display={status:"Waiting for all three fresh public books"};
      }
    } else {
      const index=Number(source().replace("replay-",""));
      recorded(index,"Recorded FX evidence · "+(archive[index]?.label ?? ""));
    }
    render();
  }
  function playback(on) {
    clearInterval(timer);
    timer=on?setInterval(advance,value("interval")):null;
    item("play").textContent=on?"Pause":"Play";
    item("play").setAttribute("aria-pressed",String(on));
  }
  function selectSource() {
    feed?.stop();
    resetDensity();
    live=[];lastId=null;recordedIndex=-1;display=null;
    feed=liveSource()?GateSpotSources.connect(source()):null;
    advance();
  }
  const shapeName = n => n===1?"1 · Torus":n===2?"2 · Double torus":n===3?"3 · Triple torus":`${n} · ${n}-holed torus`;
  options(item("genus"),available.map(n=>[shapeName(n),n]));
  item("genus").value=available.includes(Number(params.get("genus")))?params.get("genus"):"2";
  item("genus").addEventListener("change",onSurface);
  item("geometry").addEventListener("change",selectGeometry);
  for (const name of ["handle","scale","gauge","edit","dessin","fee","cloud","channel","mixing","radius"]) item(name).addEventListener("input",render);
  item("reset-packet").addEventListener("click",()=>{ resetDensity(); render(); });
  function certificate(n) {
    const message=item("certificate"), lines=item("rotation");
    lines.textContent="";
    if (!Number.isInteger(n)||n<3||n>8) {
      message.textContent="This view includes verified rotation systems for three through eight assets.";
      return;
    }
    const result=CompleteGraphRotation.certificate(n,item("certificate-mode").value);
    const sizes=new Map();
    for (const face of result.faces) sizes.set(face.length, (sizes.get(face.length)??0)+1);
    const faces=[...sizes].sort((a,b)=>a[0]-b[0]).map(([length,count])=>`${count} of length ${length}`).join(", ");
    message.textContent=`Genus ${result.genus} · Euler characteristic ${result.chi} · ${result.darts} darts · ${result.faces.length} faces (${faces}).`;
    lines.textContent=result.rotation.map((row,i)=>`${i} → ${row.join(" → ")} → ${row[0]}`).join("\n");
  }
  const capacity = () => {
    const n=value("assets");
    certificate(n);
    if (!Number.isInteger(n) || n<1 || n>1000) {
      item("capacity").textContent="Enter a whole number from 1 to 1000";
      item("load-genus").disabled=true;
      return;
    }
    const genus=SurfaceGenus.completeGenus(n);
    item("capacity").textContent=`${n*(n-1)/2} pairs · ${n*(n-1)} directed legs · minimum genus ${genus}`;
    item("load-genus").disabled=!available.includes(genus);
  };
  item("assets").addEventListener("input",capacity);
  item("certificate-mode").addEventListener("change",capacity);
  item("load-genus").addEventListener("click",()=>{
    item("genus").value=SurfaceGenus.completeGenus(value("assets"));
    onSurface();
  });
  capacity();
  item("episode").addEventListener("change",selectSource);
  item("frame").addEventListener("input",()=>{
    playback(false);
    const i=value("frame");
    const isLive=liveSource() && display?.frame?.assets && live.length>0;
    const samples=isLive?live:archive[liveSource()?0:Number(source().replace("replay-",""))]?.frames;
    if (!samples?.[i]) return;
    if (!isLive) recordedIndex=i;
    const cached=cachedDensity.get(samples[i]);
    if (cached) {
      ({packet,gauge:oldGauge,densityStep}=cached);
      evolvedFrame=samples[i];
    } else {
      resetDensity();
    }
    display={frame:samples[i],status:(isLive?"Paused · captured Gate frame":"Paused · recorded FX frame")
      +(cached?"":" · seeded density")};
    render();
  });
  item("play").addEventListener("click",()=>{
    if (timer) playback(false);
    else { playback(true); advance(); }
  });
  item("interval").addEventListener("change",()=>{ if(timer) playback(true); });
  window.addEventListener("pagehide",()=>{ feed?.stop(); playback(false); });
  window.addEventListener("pageshow",event=>{
    if (!event.persisted) return;
    selectSource(); playback(!reducedMotion);
  });
  new ResizeObserver(()=>{if(visible) draw(visible,palette());}).observe(document.getElementById("latent-chart"));
  options(item("episode"),GateSpotSources.entries().map(([id,label])=>[label,id]));
  item("episode").value=GateSpotSources.has(params.get("source"))?params.get("source"):"gate-eth";
  onSurface();
  selectSource();
  playback(!reducedMotion);
  fetch("replay.json").then(response=>{
    if(!response.ok) throw new Error("archive unavailable");
    return response.json();
  }).then(episodes=>{
    archive=episodes;
    const current=source();
    options(item("episode"),[
      ...GateSpotSources.entries().map(([id,label])=>[label,id]),
      ...archive.map((episode,i)=>[`Recorded FX · ${episode.label}`,`replay-${i}`]),
    ]);
    item("episode").value=current;
    if (!display?.frame) advance();
  }).catch(()=>{
    if (!display?.frame) {
      display={status:"Waiting for live quotes · recorded fallback unavailable"};
      render();
    }
  });
})();
