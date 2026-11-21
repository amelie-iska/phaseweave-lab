"use strict";

(() => {
  const elem = name => document.getElementById("depth-"+name);
  const panel=elem("panel"), seed=elem("report-seed"), contrast=elem("contrast");
  const arm=elem("arm"), layer=elem("layer"), traceSeed=elem("trace-seed"), wire=elem("wire");
  const step=elem("step"), rotation=elem("angle"), scene=elem("scene"), play=elem("play");
  let report, traces, trace, timer;
  const show=(n,digits=6)=>n.toFixed(digits).replace("-", "−");
  const signed=(n,digits=6)=>(n>0?"+":"")+show(n,digits);
  const key=(depth,kind,initial)=>"tokengt-w6-q3-d"+depth+"-"+kind+"-"+initial;

  function table(labels, data) {
    const result=document.createElement("table"), heading=result.createTHead().insertRow();
    for (const label of labels) {
      const c=document.createElement("th");
      c.scope="col"; c.textContent=label; heading.append(c);
    }
    const body=result.createTBody();
    for (const [label,...cells] of data) {
      const row=body.insertRow(), head=document.createElement("th");
      head.scope="row"; head.textContent=label; row.append(head);
      for (const value of cells) row.insertCell().textContent=value;
    }
    return result;
  }

  function renderScores() {
    const fold=report.splits[panel.value], shared=seed.value==="mean";
    const seeds=shared ? report.seeds : [Number(seed.value)];
    const values=report.depths.map(depth=>{
      const scores=report.arms.map(kind=>seeds.reduce((total,s)=>total+fold.cells[key(depth,kind,s)].mae_bps,0)/seeds.length);
      const pair=contrast.value==="one" ? fold.versus_depth_one[depth]?.entangling
        : fold.entangling_minus_control[depth][contrast.value];
      const chosen=shared ? pair?.mean_over_fixed_seeds : pair?.by_seed[seed.value];
      return [depth,...scores.map(v=>show(v)),chosen?signed(chosen.delta_mae_bps):"—",
        chosen?"["+signed(chosen.lower_95)+", "+signed(chosen.upper_95)+"]":"—"];
    });
    elem("status").textContent=fold.rows.toLocaleString("en-US")+" matched windows · Persistence "+
      show(fold.cells.persistence.mae_bps)+" log bp MAE.";
    elem("scores").replaceChildren(table(["Layers","Entangling","Product","Dephased","Max-plus",
      contrast.selectedOptions[0].text,"95% interval"],values));
  }

  function currentStage() {
    return trace.stages[Number(step.value)];
  }

  function drawTrace() {
    if (!trace) return;
    const frame=currentStage(), {width,height}=scene.getBoundingClientRect();
    if (width<140 || height<100) return;
    const pixelScale=Math.min(2,window.devicePixelRatio||1);
    scene.width=Math.round(pixelScale*width); scene.height=Math.round(pixelScale*height);
    const ctx=scene.getContext("2d");
    if (!ctx) return;
    ctx.scale(pixelScale,pixelScale);
    const css=getComputedStyle(document.documentElement), color=name=>css.getPropertyValue("--"+name).trim();
    const theta=Number(rotation.value)*Math.PI/180, s=Math.sin(theta), c=Math.cos(theta);
    const size=Math.min(width/5.6,height/3.7), floor=height*.74;
    const transform=(x,y,z)=>[width/2+size*(x*c+z*s),floor-size*(y+.42*(z*c-x*s))];
    const palette=[color("jade"),color("copper"),color("text")];
    function polygon(points,fill,outline,opacity=1) {
      ctx.globalAlpha=opacity;
      ctx.beginPath();
      points.forEach((p,i)=> i===0 ? ctx.moveTo(...p) : ctx.lineTo(...p));
      ctx.closePath();
      if (fill) {ctx.fillStyle=fill; ctx.fill();}
      if (outline) {ctx.strokeStyle=outline; ctx.stroke();}
      ctx.globalAlpha=1;
    }
    const board=[[-2.3,0,-1.21],[2.3,0,-1.21],[2.3,0,1.21],[-2.3,0,1.21]];
    polygon(board.map(p=>transform(...p)),color("surface"),color("line"));
    const bars=frame.probabilities.flatMap((row,w)=>row.map((p,level)=>({
      x:(w-2.5)*.73,z:(level-1)*.68,h:p*1.77,w,level,
    })));
    bars.sort((a,b)=>(b.z*c-b.x*s)-(a.z*c-a.x*s));
    for (const {x,z,h,w,level} of bars) {
      const corners=[[-.23,-.23],[.23,-.23],[.23,.23],[-.23,.23]];
      const base=corners.map(([a,b])=>transform(x+a,0,z+b));
      const cap=corners.map(([a,b])=>transform(x+a,h,z+b));
      const stroke=w===Number(wire.value)?color("text"):null;
      const chroma=palette[level];
      const side=s>=0?[0,3]:[1,2];
      polygon([base[side[0]],base[side[1]],cap[side[1]],cap[side[0]]],chroma,stroke,.52);
      polygon([base[2],base[3],cap[3],cap[2]],chroma,stroke,.73);
      polygon(cap,chroma,stroke,.94);
    }
    ctx.font="12px system-ui"; ctx.textAlign="center"; ctx.fillStyle=color("muted");
    for (let w=0;w<6;w++) {
      const [x,y]=transform((w-2.5)*.73,0,-1.24);
      ctx.fillText(String(w+1),x,y+15);
    }
    ctx.textAlign="left"; ctx.fillText("Wire",12,height-15);
    for (let level=0;level<3;level++) {
      const x=60+75*level;
      ctx.fillStyle=palette[level]; ctx.fillRect(x,height-24,9,9);
      ctx.fillStyle=color("muted"); ctx.fillText("Level "+level,x+13,height-15);
    }
    scene.setAttribute("aria-label",frame.stage+". Three-dimensional probability bars by wire and level. Exact selected-wire values follow.");
  }

  function matrix(caption, headers, real, imaginary) {
    const result=table(["Row ∖ column","0","1","2"],real.map((row,i)=>[headers[i],
      ...row.map((value,j)=>show(value,5)+(imaginary?" "+signed(imaginary[i][j],5)+"i":""))]));
    result.createCaption().textContent=caption;
    return result;
  }

  function renderStep() {
    const frame=currentStage(), w=Number(wire.value), p=frame.probabilities[w];
    elem("trace-status").textContent=frame.stage+" · Wire "+(w+1)+" · Two forecast directions "+
      trace.forecast_log_bps.map(v=>show(v,5)).join(" / ")+" log bp.";
    step.setAttribute("aria-valuetext",frame.stage);
    elem("levels").replaceChildren(table(["Measurement","Level 0","Level 1","Level 2"],
      [["Probability",...p.map(v=>show(v))]]));
    if (frame.real_density) {
      elem("matrix-note").textContent="Reduced density matrix followed by the local unitary. This wire’s purity is "+
        show(frame.purity[w])+". Rows of the gate are output levels and columns are input levels.";
      elem("density").replaceChildren(matrix("Reduced density matrix",["0","1","2"],frame.real_density[w],frame.imag_density[w]));
      elem("mixer").replaceChildren(matrix("Local mixer",["0","1","2"],trace.mixer_real[w],trace.mixer_imag[w]));
    } else {
      elem("matrix-note").textContent="Transition probabilities for this classical control. Rows are output levels and columns are input levels.";
      elem("density").replaceChildren();
      elem("mixer").replaceChildren(matrix("Transition probabilities",["0","1","2"],trace.transition_probability[w]));
    }
    drawTrace();
  }

  function pause() {
    clearInterval(timer); timer=undefined; play.textContent="Play trace"; play.setAttribute("aria-pressed","false");
  }

  function selectTrace() {
    pause();
    trace=traces.cells[key(layer.value,arm.value,traceSeed.value)];
    step.max=trace.stages.length-1; step.value="0";
    renderStep();
  }

  async function json(asset) {
    const response=await fetch(asset);
    if (!response.ok) throw Error("Missing evidence");
    return response.json();
  }

  Promise.all([json("stacked-clock-fx-v1.json"),json("stacked-clock-traces-v1.json")]).then(([scores,states])=>{
    if (scores.format!=="phaseweave.stacked-clock-scores.v1" ||
        states.format!=="phaseweave.stacked-clock-real-frame-traces.v1" ||
        states.fit_seal_sha256!==scores.fit_seal_sha256 || Object.keys(states.cells).length!==24)
      throw Error("Unexpected render evidence");
    report=scores; traces=states;
    for (const control of [panel,seed,contrast]) control.addEventListener("change",renderScores);
    for (const control of [arm,layer,traceSeed]) control.addEventListener("change",selectTrace);
    wire.addEventListener("change",renderStep);
    step.addEventListener("input",()=>{pause();renderStep();});
    rotation.addEventListener("input",drawTrace);
    play.addEventListener("click",()=>{
      if (timer) {pause();return;}
      if (step.value===step.max) step.value="0";
      renderStep(); play.textContent="Pause trace"; play.setAttribute("aria-pressed","true");
      timer=setInterval(()=>{
        if (step.value===step.max) {pause();return;}
        step.value=String(Number(step.value)+1); renderStep();
      },650);
    });
    new ResizeObserver(drawTrace).observe(scene);
    new MutationObserver(drawTrace).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    renderScores(); selectTrace();
  }).catch(()=>{
    elem("status").textContent="The forecast evidence could not load.";
    elem("trace-status").textContent="The trained trace could not load.";
    scene.hidden=true;
  });
})();
