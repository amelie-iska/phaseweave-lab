"use strict";

(() => {
  const get = id => document.getElementById("gate-transfer-" + id);
  const [backbone, attention, seed, metric] = ["backbone","attention","seed","metric"].map(get);
  const labels = {gcn:"GCN",gcn_tokengt:"GCN → TokenGT",tokengt:"TokenGT",softmax:"Softmax",tropical:"Tropical",
    entangling:"Entangling",product:"Product",dephased:"Dephased",maxplus:"Max-plus"};
  const fmt = n => n.toFixed(6).replace("-", "−");
  const signed = n => (n > 0 ? "+" : "") + fmt(n);
  const hour = stamp => new Date(Number(stamp)*1000).toISOString().slice(11,13);
  const canvas = get("hours"), status = get("summary");
  let evidence, hours;

  function table(cols, rows) {
    const t = document.createElement("table"), head = t.createTHead().insertRow(), body = t.createTBody();
    for (const col of cols) {
      const th = document.createElement("th");
      th.scope = "col"; th.textContent = col; head.append(th);
    }
    for (const [label,...cells] of rows) {
      const tr = body.insertRow(), th = document.createElement("th");
      th.scope = "row"; th.textContent = label; tr.append(th);
      for (const cell of cells) tr.insertCell().textContent = cell;
    }
    return t;
  }

  function draw() {
    if (!hours?.length) return;
    const {width,height} = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx || width < 160 || height < 90) return;
    const pixels = Math.min(2,devicePixelRatio || 1);
    canvas.width = Math.ceil(width*pixels); canvas.height = Math.ceil(height*pixels);
    ctx.scale(pixels,pixels);
    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue("--"+name).trim();
    const v = hours.map(([,record]) => record.selected_minus_persistence_bps);
    const lo = Math.min(0,...v), hi = Math.max(0,...v);
    if (hi === lo) return;
    const y = value => 18+(hi-value)*(height-60)/(hi-lo);
    const slot = (width-55)/hours.length, w = Math.min(42,slot*.67);
    ctx.strokeStyle = color("line"); ctx.beginPath();
    ctx.moveTo(45,y(0)); ctx.lineTo(width-10,y(0)); ctx.stroke();
    ctx.font = "12px system-ui";
    ctx.fillStyle = color("muted"); ctx.textAlign = "right"; ctx.fillText("0",40,y(0)+4);
    if (y(lo)-y(0)>18) ctx.fillText(lo.toFixed(3),40,y(lo)+4);
    if (y(0)-y(hi)>18) ctx.fillText(hi.toFixed(3),40,y(hi)+4);
    ctx.textAlign = "left";
    hours.forEach(([stamp],i) => {
      const x = 45+(i+.5)*slot, yy = y(v[i]), zero = y(0);
      ctx.fillStyle = color(v[i] > 0 ? "copper" : "jade");
      ctx.fillRect(x-w/2,Math.min(yy,zero),w,Math.max(1,Math.abs(yy-zero)));
      ctx.fillStyle = color("muted"); ctx.fillText(hour(stamp),x-6,height-22);
    });
    ctx.fillStyle = color("muted"); ctx.fillText("UTC hour",12,height-5);
  }

  function showScores() {
    const activeSeeds = seed.value === "mean" ? evidence.seeds : [Number(seed.value)];
    const cell = (depth, arm) => activeSeeds.reduce((sum,s) => sum+evidence.results.cells[
      `${backbone.value}-${attention.value}-w6-q3-d${depth}-${arm}-${s}`][metric.value],0)/activeSeeds.length;
    get("scores").replaceChildren(table(["Layers",...evidence.arms.map(arm=>labels[arm]),"Persistence"],
      evidence.depths.map(d => [d,...evidence.arms.map(arm=>fmt(cell(d,arm))),
        fmt(evidence.results.cells.persistence[metric.value])])));
  }

  fetch("gate-clock-transfer-v1.json").then(r => {
    if (!r.ok) throw Error("Missing Gate score receipt");
    return r.json();
  }).then(raw => {
    if (raw.format !== "phaseweave.gate-clock-transfer-scores.v1" || Object.keys(raw.results.cells).length !== 145)
      throw Error("Unexpected score receipt");
    evidence = raw; hours = Object.entries(raw.results.hours).sort((a,b)=>Number(a[0])-Number(b[0]));
    const [id] = raw.results.selected_model_ids;
    const fields = id.match(/^(gcn|gcn_tokengt|tokengt)-(softmax|tropical)-w6-q3-d(\d)-(entangling|product|dephased|maxplus)-\d+$/u);
    if (!fields) throw Error("Unexpected FX model identifier");
    const [,b,a,d,arm] = fields, result = raw.results.contrasts["fx-validation-selected-minus-persistence"];
    const interval = result.paired_hour_95?.map(signed).join(", ");
    status.textContent = raw.scored_rows.toLocaleString("en-US")+" matched targets from "
      +raw.origin_rows.toLocaleString("en-US")+" forecast origins · FX selection "+labels[b]+" · "+labels[a]
      +" · "+d+" layers · "+labels[arm]+". Mean MAE change "+signed(result.mean_delta_mae_bps)+" log bp"
      +(interval ? " with paired 95% interval ["+interval+"]." : ".");
    const means = new Map();
    for (const [id,row] of Object.entries(raw.results.cells)) {
      if (id === "persistence") continue;
      const base = id.slice(0,id.lastIndexOf("-"));
      means.set(base,(means.get(base)??0)+row.mae_bps/raw.seeds.length);
    }
    const persistence = raw.results.cells.persistence.mae_bps;
    const ahead = [...means.values()].filter(error=>error<persistence).length;
    get("roster").textContent = ahead+" of "+means.size+" two-seed configurations beat persistence ("
      +fmt(persistence)+" log bp MAE).";
    get("hour-table").replaceChildren(table(["UTC hour","Targets","Selected MAE","Persistence MAE","Paired change"],
      hours.map(([stamp,row]) => [hour(stamp)+":00",row.rows,fmt(row.selected_mae_bps),fmt(row.persistence_mae_bps),
        signed(row.selected_minus_persistence_bps)])));
    backbone.value = b; attention.value = a;
    for (const control of [backbone,attention,seed,metric]) control.addEventListener("change", showScores);
    new ResizeObserver(draw).observe(canvas);
    new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    showScores(); draw();
  }).catch(() => {status.textContent = "The sealed Gate score receipt could not load.";});
})();
