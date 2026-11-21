"use strict";

(() => {
  const element = id => document.getElementById("joint-" + id);
  const labels = {joint:"Joint continuous",all_disabled:"Encoder only",persistence:"Persistence",
    without_analogy:"Without analogy",without_cycle:"Without cycle patch",without_flow:"Without GFlowNet",
    without_forest:"Without forest",without_steer:"Without steering"};
  const tenors = [1,5,15,60,300];
  const fixed = n => Number.isFinite(n) ? n.toFixed(5) : "—";
  const count = n => Number(n).toLocaleString("en-US");
  const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;

  function table(caption, keys, rows) {
    const out = document.createElement("table");
    out.createCaption().textContent = caption;
    const header = out.createTHead().insertRow();
    keys.forEach(key => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = key;
      header.append(cell);
    });
    const body = out.createTBody();
    rows.forEach(([key,...fields]) => {
      const row = body.insertRow();
      const title = document.createElement("th");
      title.scope = "row";
      title.textContent = key;
      row.append(title);
      fields.forEach(value => { row.insertCell().textContent = value; });
    });
    return out;
  }

  function rows(data) {
    const size = element("length").value, support = element("support").value;
    const {score} = data;
    const values = Object.entries(score[support]).map(([arm,v]) => ({
      name: labels[arm],
      scores: tenors.map(h => v.cells[size+"/"+h].mae),
      keys: tenors.map(h => v.cells[size+"/"+h].n),
    })).sort((a,b)=>mean(a.scores)-mean(b.scores));
    const cohorts = values[0].keys.map(count);
    element("status").textContent = size + "-leg CHF routes · " + count(score.input_origins) + " origins · " +
      count(values[0].keys.reduce((a,b)=>a+b,0)) + " scored labels across five tenors";
    element("results").replaceChildren(table(
      "MAE · " + cohorts.join(" / ") + " labels by tenor",
      ["Arm",...tenors.map(h=>h+" s"),"Macro"],
      values.map(row=>[row.name,...row.scores.map(fixed),fixed(mean(row.scores))])
    ));
  }

  function svg(tag, props) {
    const node = document.createElementNS("http://www.w3.org/2000/svg",tag);
    Object.entries(props).forEach(([name,value]) => node.setAttribute(name,value));
    return node;
  }

  function plot(primary) {
    const vals = primary.day_rows.filter(row=>row.delta_mae_log_bp!==null);
    const max = Math.max(...vals.map(row=>Math.abs(row.delta_mae_log_bp)),.0001);
    const width = 640, base = 82, length = 525;
    const pos = x => base + length/2 + x/max * length/2;
    const result = svg("svg",{viewBox:"0 0 640 185",width:"100%",role:"img",
      "aria-label":"Day-by-day joint minus encoder MAE on five-leg routes"});
    result.style.maxWidth = width+"px";
    result.append(svg("line",{x1:pos(0),y1:1,x2:pos(0),y2:156,stroke:"var(--muted)"}));
    vals.forEach((row,i) => {
      const y=10+i*18, value=row.delta_mae_log_bp;
      const text=svg("text",{x:8,y:y+4,fill:"var(--muted)","font-size":11});
      text.textContent=row.day.slice(5);
      result.append(text,svg("line",{x1:pos(0),y1:y,x2:pos(value),y2:y,
        stroke:value<0?"var(--jade)":"var(--copper)","stroke-width":6}),
        svg("circle",{cx:pos(value),cy:y,r:3,fill:"var(--text)"}));
    });
    for (const v of [-max,0,max]) {
      const text=svg("text",{x:pos(v),y:175,fill:"var(--muted)","font-size":11,"text-anchor":"middle"});
      text.textContent=fixed(v);
      result.append(text);
    }
    return result;
  }

  async function load() {
    const response = await fetch("joint-fx-confirmation-v1.json");
    if (!response.ok) throw Error("Missing receipt");
    const data = await response.json();
    if (data.format !== "phaseweave.joint-confirmation-browser.v1") throw Error("Unexpected receipt");
    for (const key of ["length","support"]) element(key).addEventListener("change",()=>rows(data));
    rows(data);
    const primary=data.score.primary;
    element("primary").textContent = "Joint minus encoder-only MAE " + fixed(primary.delta_mae_log_bp) +
      " log bp. Day-block 95% interval [" + primary.interval_95_log_bp.map(fixed).join(", ") + "].";
    element("plot").replaceChildren(plot(primary));
    element("days").replaceChildren(table("Equal-tenor effects by session",
      ["UTC day","Joint minus encoder MAE","Total labels"],
      primary.day_rows.map(row=>[row.day,fixed(row.delta_mae_log_bp),count(row.tenor_counts.reduce((a,b)=>a+b,0))])));
    const live=data.live;
    element("live-status").textContent = count(live.counts.forecast_origins ?? 0) +
      " forecast origins · " + (live.compute_p95_ms===null?"no timed inference":live.compute_p95_ms.toFixed(2)+" ms compute p95");
    element("live").replaceChildren(table("Observed pairs and quote error in log basis points",
      ["Tenor","Issued","Scored","Unscored","Joint","Encoder","Without GFlowNet","Persistence"],
      tenors.map(h=>{
        const cell=live.tenors[String(h)] ?? {issued:0,scored:0,unscored:0,pair_mae_log_bp:{}};
        return [h+" s",cell.issued,cell.scored,cell.unscored,
          ...["joint","all_disabled","without_flow","persistence"].map(key=>fixed(cell.pair_mae_log_bp[key]))];
      })));
  }

  load().catch(()=>{
    element("status").textContent="The verified score file could not be loaded.";
    element("live-status").textContent="The live receipt could not be loaded.";
  });
})();
