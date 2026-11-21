"use strict";

(() => {
  const item = name => document.getElementById("wide-2019-"+name);
  const metric = item("metric"), model = item("model"), plot = item("plot");
  const reference = "lgbm_jupiter_60";
  const refRank = "lightgbm-gaussian-rank";
  let result;
  const formatted = (n, precision=6) => n.toFixed(precision).replace("-", "−");
  const signed = (n, precision=6) => (n>0?"+":"") + formatted(n,precision);

  function table(headers, records) {
    const grid = document.createElement("table");
    const heading = grid.createTHead().insertRow();
    for (const label of headers) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      heading.append(cell);
    }
    const body = grid.createTBody();
    for (const [label,...values] of records) {
      const row = body.insertRow(), labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.textContent = label;
      row.append(labelCell);
      for (const value of values) row.insertCell().textContent = value;
    }
    return grid;
  }

  function series() {
    return result.weekly.map(row=>({
      date: row.date, candidate: row[metric.value][model.value], reference: row[metric.value][reference],
    }));
  }

  function draw() {
    if (!result) return;
    const points = series();
    const {width,height} = plot.getBoundingClientRect();
    if (width < 140 || height < 100) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    plot.width = Math.round(width * scale);
    plot.height = Math.round(height * scale);
    const ctx = plot.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale,scale);
    const style = getComputedStyle(document.documentElement);
    const color = name => style.getPropertyValue("--"+name).trim();
    const values = points.map(p => p.candidate - p.reference);
    const domain = Math.max(.001,...values.map(Math.abs))*1.12;
    const left = 61, right = width-13, top = 31, bottom = height-24;
    const step = (right-left)/points.length;
    const y = value => top+(domain-value)*(bottom-top)/(2*domain);
    ctx.font = "12px system-ui";
    ctx.fillStyle = color("muted");
    ctx.fillText("Δ "+metric.selectedOptions[0].text+" per Friday", left,15);
    ctx.strokeStyle = color("line");
    for (const tick of [-domain/2,0,domain/2]) {
      const yy = y(tick);
      ctx.beginPath();
      ctx.moveTo(left,yy);
      ctx.lineTo(right,yy);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(tick===0?"0":signed(tick,3),left-7,yy+4);
    }
    for (const [index,value] of values.entries()) {
      const edge = y(value), zero = y(0);
      ctx.fillStyle = color(value>=0?"jade":"copper");
      ctx.fillRect(left+(index+.12)*step,Math.min(edge,zero),.76*step,Math.max(Math.abs(edge-zero),.6));
    }
    ctx.fillStyle = color("muted");
    for (const [index, alignment] of [[0,"left"],[12,"center"],[25,"right"]]) {
      ctx.textAlign = alignment;
      ctx.fillText(points[index].date.slice(5),left+(index+.5)*step,height-8);
    }
    plot.setAttribute("aria-label", model.selectedOptions[0].text+" minus published LightGBM, "+
      metric.selectedOptions[0].text+" for 26 Fridays. Exact values follow in the weekly table.");
  }

  function render() {
    const selected = result.summary.overall.metrics[metric.value];
    const comparison = selected.comparisons[model.value+" vs "+refRank];
    const ci = comparison.interval_95["13"];
    item("status").textContent = "Mean change "+signed(comparison.mean_delta)+" · Led on "+
      comparison.wins+" of 26 Fridays · 13-week 95% interval ["+ci.map(n=>signed(n)).join(", ")+"].";
    item("weekly").replaceChildren(table(["UTC date", "Selected score", "Published LightGBM", "Difference"],
      series().map(p=>[p.date,formatted(p.candidate),formatted(p.reference),signed(p.candidate-p.reference)])));
    draw();
  }

  fetch("numerai-fullwidth-2019-v1.json").then(response=>{
    if (!response.ok) throw Error("Missing cohort receipt");
    return response.json();
  }).then(data=>{
    if (data.format!=="phaseweave.numerai-fullwidth-2019-chart.v1" || data.weekly.length!==26 ||
        data.summary.overall.keys!==159982) throw Error("Unexpected result roster");
    result = data;
    const means = result.summary.overall.metrics;
    item("overall").replaceChildren(table(["Forecast","Neutral CORR","Raw CORR"],
      Object.entries(result.model_labels).sort((a,b)=>
        means.neutral_corr.means[b[0]]-means.neutral_corr.means[a[0]])
      .map(([id,label])=>[label,formatted(means.neutral_corr.means[id]),formatted(means.raw_corr.means[id])])));
    for (const control of [model,metric]) control.addEventListener("change",render);
    new ResizeObserver(draw).observe(plot);
    new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    render();
  }).catch(()=>{
    item("status").textContent="The 2019 weekly comparison could not load.";
    plot.hidden=true;
  });
})();
