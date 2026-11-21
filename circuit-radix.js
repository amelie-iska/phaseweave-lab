"use strict";
(() => {
  const get = name => document.getElementById("radix-"+name);
  const cohort = get("cohort"), seed = get("seed"), work = get("work");
  const number = (value,digits=6) => value.toFixed(digits);
  const interval = (lower,upper) => "["+number(lower)+", "+number(upper)+"]";
  const seeds = [20261225,20261226];

  function grid(headers,rows) {
    const table=document.createElement("table");
    const row=table.createTHead().insertRow();
    for (const label of headers) {
      const cell=document.createElement("th");
      cell.scope="col"; cell.textContent=label; row.append(cell);
    }
    const body=table.createTBody();
    for (const [head,...values] of rows) {
      const entry=body.insertRow(), name=document.createElement("th");
      name.scope="row"; name.textContent=head; entry.append(name);
      for (const value of values) entry.insertCell().textContent=value;
    }
    return table;
  }

  function forecast(data) {
    const later=cohort.value==="november";
    const fold=later ? data.november.results : data.forecasts.splits[cohort.value];
    const selected=seed.value==="mean" ? seeds : [Number(seed.value)];
    const score=(radix,phase)=>{
      const values=selected.map(s=>fold.cells["tokengt-q"+radix+"-"+phase+"-"+s].mae_bps);
      return number(values.reduce((sum,x)=>sum+x,0)/values.length);
    };
    const rows=[2,3,5].map(q=>{
      const row=fold.entangling_minus_product[q];
      const pair=seed.value==="mean" ? row.mean_over_fixed_seeds : row.by_seed[seed.value];
      return [q,score(q,"entangling"),score(q,"product"),number(pair.delta_mae_bps),
        interval(pair.lower_95,pair.upper_95)];
    });
    const days=fold.entangling_minus_product[2].mean_over_fixed_seeds.utc_day_blocks;
    const coverage=later ? " of "+data.november.predictor_rows.toLocaleString("en-US")+" sealed predictors" : "";
    get("status").textContent=fold.rows.toLocaleString("en-US")+" matched target windows"+coverage+
      " across "+days+" UTC-day groups · Persistence "+number(fold.cells.persistence.mae_bps)+" log bp MAE.";
    get("forecast").replaceChildren(grid(
      ["Levels per wire","Entangling MAE","Product MAE","Paired change","95% day-block interval"],rows));
  }

  function resources(data) {
    const rows=data.measurements.arms.map(r=>{
      const dense=r.timings.dense[work.value], local=r.timings.local[work.value];
      const mem = stat=>number(stat.additional_peak_bytes/1048576,2);
      const ms = stat=>number(stat.median_ms,3);
      return [r.radix+" · "+r.phase,r.joint_amplitudes,ms(dense),ms(local),mem(dense),mem(local)];
    });
    get("resource").replaceChildren(grid(
      ["Circuit","Joint amplitudes","Dense ms","Reduced ms","Dense MiB","Reduced MiB"],rows));
  }

  const replicationPanel=get("replication-panel"), uncertainty=get("replication-uncertainty");
  const plot=get("replication-chart");
  const levels=[2,3,5];

  function drawReplication(fold) {
    const {width,height}=plot.getBoundingClientRect();
    if (width<80 || height<80) return;
    const scale=Math.min(2,window.devicePixelRatio||1);
    plot.width=Math.round(width*scale); plot.height=Math.round(height*scale);
    const ctx=plot.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale,scale);
    const style=getComputedStyle(document.documentElement);
    const color=name=>style.getPropertyValue("--"+name).trim();
    const effects=levels.map(level=>fold.phase_effects[level]);
    const spread=Math.max(0.001,...effects.flatMap(effect=>Object.values(effect.by_seed_bps).map(Math.abs)))*1.1;
    const left=42, right=width-14, zero=(left+right)/2;
    const x=value=>zero+(right-left)*value/(2*spread);

    ctx.font="12px system-ui";
    ctx.fillStyle=color("muted");
    ctx.fillText("Δ MAE (log bp)",left,15);
    ctx.textAlign="center";
    ctx.fillText("0",zero,height-10);
    ctx.textAlign="left";
    ctx.fillText(number(-spread,3),left,height-10);
    ctx.textAlign="right";
    ctx.fillText(number(spread,3),right,height-10);
    ctx.textAlign="left";
    ctx.strokeStyle=color("line");
    ctx.beginPath(); ctx.moveTo(zero,21); ctx.lineTo(zero,height-25); ctx.stroke();
    effects.forEach((effect,index)=>{
      const level=levels[index], y=48+42*index;
      const [lo,hi]=effect[uncertainty.value+"_interval_bps"];
      ctx.fillStyle=color("muted");
      ctx.fillText("q="+level,10,y+3);
      [...Object.values(effect.by_seed_bps)].sort((a,b)=>a-b).forEach((delta,i)=>{
        ctx.fillStyle=color(delta<0?"jade":"copper");
        ctx.beginPath(); ctx.arc(x(delta),y+13+(i%3)*3,2.5,0,2*Math.PI); ctx.fill();
      });
      ctx.strokeStyle=color("muted");
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(x(lo),y); ctx.lineTo(x(hi),y); ctx.stroke();
      const center=x(effect.mean_bps);
      ctx.fillStyle=color("jade");
      ctx.beginPath();
      ctx.moveTo(center,y-5); ctx.lineTo(center+5,y); ctx.lineTo(center,y+5);
      ctx.lineTo(center-5,y); ctx.closePath(); ctx.fill();
    });
    plot.setAttribute("aria-label",replicationPanel.selectedOptions[0].text+" phase effects with "+
      uncertainty.selectedOptions[0].text+" intervals. The table gives the exact values.");
  }

  function showReplication(data) {
    const fold=data.panels[replicationPanel.value];
    const table=levels.map(level=>{
      const effect=fold.phase_effects[level], sign=effect.seed_sign_counts;
      return [level,number(effect.mean_bps),interval(...effect[uncertainty.value+"_interval_bps"]),
        sign.lower_error,sign.higher_error,sign.tie,number(effect.seed_sd_bps)];
    });
    get("replication-status").textContent=fold.rows.toLocaleString("en-US")+" of "+
      fold.forecasts.toLocaleString("en-US")+" forecasts scored · "+fold.utc_days+
      " UTC-day groups · Persistence "+number(fold.cells.persistence.mae_bps)+" log bp MAE.";
    get("replication-summary").replaceChildren(grid(
      ["Levels","Mean Δ MAE","95% interval","Seeds improved","Seeds worsened","Ties","Seed SD"],table));
    get("replication-seeds").replaceChildren(grid(["Seed","q=2","q=3","q=5"],
      data.initialization_seeds.map(seed=>[seed,...levels.map(level=>number(fold.phase_effects[level].by_seed_bps[seed]))])));
    drawReplication(fold);
  }

  const chain = name => document.getElementById("clock-chain-"+name);
  const chainPanel=chain("panel"), chainSeed=chain("seed"), chainControl=chain("control");

  function showChain(data) {
    const fold=data.panels[chainPanel.value];
    const selected=chainSeed.value==="mean" ? data.seeds : [Number(chainSeed.value)];
    const result=(q,arm)=>{
      const values=selected.map(s=>fold.cells[`tokengt-w8-q${q}-${arm}-${s}`].mae_bps);
      return number(values.reduce((sum,value)=>sum+value,0)/values.length);
    };
    const control=chainControl.value;
    const rows=data.radices.map(q=>{
      const contrast=fold.entangling_minus_control[q][control];
      const pair=selected.length===2 ? contrast.mean_over_fixed_seeds : contrast.by_seed[selected[0]];
      return [q,...data.arms.map(arm=>result(q,arm)),number(pair.delta_mae_bps),interval(pair.lower_95,pair.upper_95)];
    });
    const matched=fold.rows.toLocaleString("en-US");
    const coverage=chainPanel.value==="afternoon" ? matched+" of "+
      data.afternoon.anchors.toLocaleString("en-US")+" sealed predictors" : matched+" forecast windows";
    chain("status").textContent=coverage+" scored · Persistence "+number(fold.cells.persistence.mae_bps)+" log bp MAE.";
    const label=chainControl.selectedOptions[0].text.toLowerCase();
    chain("results").replaceChildren(grid(
      ["Radix","Entangling","Product","Dephased","Max-plus","Entangling − "+label,"95% interval"],rows));
  }

  fetch("clock-chain-fx-v1.json").then(response=>{
    if(!response.ok) throw Error("Missing eight-wire receipt");
    return response.json();
  }).then(data=>{
    if(data.format!=="phaseweave.clock-chain-fx-public.v1") throw Error("Unknown eight-wire score receipt");
    const render=()=>showChain(data);
    for (const control of [chainPanel,chainSeed,chainControl]) control.addEventListener("change",render);
    render();
    chain("resources").replaceChildren(grid(["Radix","Joint amplitudes per frame","Local density entries","Peak allocated MiB"],
      data.radices.map(q=>{
        const fits=data.fits.filter(fit=>fit.radix===q);
        return [q,fits[0].joint_amplitudes.toLocaleString("en-US"),fits[0].local_density_elements,
          number(Math.max(...fits.map(fit=>fit.peak_allocated_bytes))/1048576,2)];
      })));
  }).catch(()=>{ chain("status").textContent="The eight-wire forecast evidence could not load."; });

  fetch("circuit-radix-seed-replication-v1.json").then(response=>{
    if(!response.ok) throw Error("Missing replication receipt");
    return response.json();
  }).then(data=>{
    if(data.format!=="phaseweave.circuit-radix-replication-score.v1") throw Error("Unknown score receipt");
    const redraw=()=>drawReplication(data.panels[replicationPanel.value]);
    replicationPanel.addEventListener("change",()=>showReplication(data));
    uncertainty.addEventListener("change",()=>showReplication(data));
    new ResizeObserver(redraw).observe(plot);
    new MutationObserver(redraw).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    showReplication(data);
  }).catch(()=>{
    plot.hidden=true;
    get("replication-status").textContent="The replication receipt could not load.";
  });

  fetch("circuit-radix-v1.json").then(response=>{
    if(!response.ok) throw Error("Missing comparison receipt");
    return response.json();
  }).then(data=>{
    if(data.format!=="phaseweave.circuit-radix-public.v1") throw Error("Unknown comparison receipt");
    cohort.addEventListener("change",()=>forecast(data));
    seed.addEventListener("change",()=>forecast(data));
    work.addEventListener("change",()=>resources(data));
    forecast(data);resources(data);
  }).catch(()=>{ get("status").textContent="The verified comparison could not load."; });
})();
