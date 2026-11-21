"use strict";

(() => {
  const get = id => document.getElementById("grid-" + id);
  const selectors = ["panel", "backbone", "attention", "seed", "metric"].map(get);
  const [panel, backbone, attention, seed, metric] = selectors;
  const canvas = get("chart"), status = get("status");
  const labels = {gcn:"GCN",gcn_tokengt:"GCN → TokenGT",tokengt:"TokenGT",softmax:"Softmax",tropical:"Tropical",
    entangling:"Entangling",product:"Product",dephased:"Dephased",maxplus:"Max-plus"};
  const format = value => value.toFixed(6).replace("-", "−");
  const signed = value => (value > 0 ? "+" : "") + format(value);
  const band = values => values ? "[" + values.map(signed).join(", ") + "]" : "—";
  const modelId = (b,a,d,arm,s) => `${b}-${a}-w6-q3-d${d}-${arm}-${s}`;
  let report;

  function tabulate(columns, rows) {
    const result = document.createElement("table"), heading = result.createTHead().insertRow();
    for (const label of columns) {
      const cell = document.createElement("th");
      cell.scope = "col"; cell.textContent = label; heading.append(cell);
    }
    const body = result.createTBody();
    for (const [label, ...values] of rows) {
      const row = body.insertRow(), key = document.createElement("th");
      key.scope = "row"; key.textContent = label; row.append(key);
      for (const value of values) row.insertCell().textContent = value;
    }
    return result;
  }

  function chart() {
    if (!report) return;
    const split = report.splits[panel.value];
    const groups = report.backbones.flatMap(b => report.attention.map(a => ({
      name:labels[b], rule:labels[a], ...split.comparisons[`depth4-minus-depth1:${b}:${a}:entangling`]
    })));
    const {width, height} = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx || width < 165) return;
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.ceil(width*ratio); canvas.height = Math.ceil(height*ratio);
    ctx.scale(ratio,ratio);
    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue("--"+name).trim();
    const bands = groups.map(row => row.simultaneous_95 ?? row.paired_95);
    const low = Math.min(0,...bands.map(row => row[0]),...groups.map(row => Math.min(row.paired_95[0],row.mean_delta_mae_bps)));
    const high = Math.max(0,...bands.map(row => row[1]),...groups.map(row => Math.max(row.paired_95[1],row.mean_delta_mae_bps)));
    if (!(high > low)) return;
    const start = 121, end = width-24, x = value => start+(value-low)*(end-start)/(high-low);
    function rule(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
    ctx.font = "11px system-ui";
    ctx.strokeStyle = color("line"); rule(x(0),13,x(0),height-28);
    ctx.fillStyle = color("muted"); ctx.fillText("0",x(0)-3,height-9);
    if (x(0)-start > 48) ctx.fillText(low.toFixed(4),start,height-9);
    if (end-x(0) > 48) {
      ctx.textAlign="right"; ctx.fillText(high.toFixed(4),end,height-9); ctx.textAlign="left";
    }
    groups.forEach((group,i) => {
      const y = 24 + i*36;
      ctx.fillStyle = color("text"); ctx.fillText(group.name,8,y);
      ctx.fillStyle = color("muted"); ctx.fillText(group.rule,8,y+12);
      ctx.strokeStyle = color("muted"); ctx.lineWidth = 1;
      rule(x(bands[i][0]),y,x(bands[i][1]),y);
      ctx.strokeStyle = color("jade"); ctx.lineWidth = 2;
      rule(x(group.paired_95[0]),y,x(group.paired_95[1]),y);
      ctx.fillStyle = color(group.mean_delta_mae_bps > 0 ? "copper" : "jade"); ctx.beginPath();
      ctx.arc(x(group.mean_delta_mae_bps),y,3.4,0,2*Math.PI); ctx.fill();
    });
    canvas.setAttribute("aria-label", "Six depth differences in log basis points on "
      + panel.selectedOptions[0].text + (split.primary_simultaneous_radius !== null
        ? " with both pointwise and simultaneous intervals" : " with pointwise intervals"));
  }

  function render() {
    if (!report) return;
    const split = report.splits[panel.value];
    const names = split.primary_family_keys;
    const intervals = names.map(key => split.comparisons[key].simultaneous_95);
    const excluded = intervals.filter(bound => bound && (bound[0] > 0 || bound[1] < 0)).length;
    status.textContent = split.rows.toLocaleString("en-US")+" windows across "+split.utc_days+" UTC days"
      + (intervals[0] ? " · "+excluded+" of "+names.length+" simultaneous bands exclude zero." : " · Pointwise intervals.");
    const contrasts = names.map(key => {
      const [kind,b,a] = key.split(":"), row = split.comparisons[key];
      const context = labels[b]+" · "+labels[a];
      return [kind === "depth-relative-to-tokengt" ? context+" depth change minus TokenGT" : context,
        signed(row.mean_delta_mae_bps),band(row.paired_95),band(row.simultaneous_95)];
    });
    get("contrasts").replaceChildren(tabulate(["Contrast","Mean Δ MAE","Pointwise 95%","Simultaneous 95%"],contrasts));
    const seeds = seed.value === "mean" ? report.seeds : [Number(seed.value)];
    const cell = (depth, arm) => seeds.reduce((sum,s) =>
      sum+split.cells[modelId(backbone.value,attention.value,depth,arm,s)][metric.value],0)/seeds.length;
    get("forecast-table").replaceChildren(tabulate(["Layers",...report.arms.map(arm => labels[arm]),"Persistence"],
      report.depths.map(depth => [depth,...report.arms.map(arm => format(cell(depth,arm))),
        format(split.cells.persistence[metric.value])])));
    get("active").textContent = metric.selectedOptions[0].text+" in log basis points · "
      +report.parameters.toLocaleString("en-US")+" trainable parameters per fit.";
    chart();
  }

  fetch("backbone-clock-grid-v1.json").then(response => {
    if (!response.ok) throw Error("Score receipt unavailable");
    return response.json();
  }).then(data => {
    if (data.format !== "phaseweave.backbone-clock-grid-scores.v1" || Object.keys(data.resources).length !== 144
        || data.parameters !== 1538073) throw Error("Unexpected score receipt");
    report = data;
    selectors.forEach(control => control.addEventListener("change",render));
    new ResizeObserver(chart).observe(canvas);
    new MutationObserver(chart).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    render();
  }).catch(() => {status.textContent = "The verified score receipt could not load.";});
})();
