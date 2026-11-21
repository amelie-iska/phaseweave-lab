"use strict";
(() => {
  const el = key => document.getElementById("cycle-" + key);
  const names = {gcn:"GCN",gat:"GAT",mpnn:"MPNN",tokengt:"TokenGT-style",
    gcn_tokengt:"GCN + token attention",gat_tokengt:"GAT + token attention",mpnn_tokengt:"MPNN + token attention",
    persistence:"Persistence",ridge:"Ridge",hgb:"Histogram gradient boosting"};
  const avg = entries => entries.reduce((a,b)=>a+b,0)/entries.length;
  function add(parent, tag, text) {
    const child = document.createElement(tag);
    child.textContent = text;
    parent.append(child);
    return child;
  }
  function render(data) {
    const fold = el("fold").value;
    const size = el("length");
    size.options[2].disabled = fold !== "new_asset";
    if (size.value === "5" && size.options[2].disabled) size.value = "4";
    const dataset = data.runs[el("cadence").value];
    const marks = dataset.folds[fold][el("cohort").value];
    const groupSeed = el("detail").value === "avg";
    const group = new Map();
    for (const [key, entry] of Object.entries(marks)) {
      const model = dataset.models[key];
      const record = entry[size.value][el("tenor").value];
      if (!record.observations) continue;
      const arm = !model ? key : [model.backbone,model.patch,model.attention].join("/");
      const id = groupSeed ? arm : key;
      const name = model ? names[model.backbone] : names[key];
      const rows = group.get(id) ?? {title:name,model,marks:[],seeds:[]};
      rows.marks.push(record);
      if (model) rows.seeds.push(model.seed);
      group.set(id,rows);
    }
    const rows = [...group.values()].map(row=>({...row,mae:avg(row.marks.map(x=>x.mae_log_bps))}))
      .sort((a,b)=>a.mae-b.mae);
    const table = document.createElement("table");
    add(table,"caption","Forecast errors in log basis points. Lower is better.");
    const head = table.createTHead().insertRow();
    for (const name of ["Architecture","Patch","Attention","Seed","MAE","RMSE","Per-origin MAE","Per-route MAE","Scored keys"]) {
      add(head,"th",name).scope = "col";
    }
    const body = table.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      add(tr,"th",row.title).scope = "row";
      const model = row.model;
      const fields = [model?.patch ?? "—",model?.attention ?? "—",
        row.seeds.length ? (groupSeed ? row.seeds.length + " seeds" : row.seeds[0]) : "—",
        row.mae.toFixed(6),
        ...["rmse_log_bps","origin_macro_mae_log_bps","route_macro_mae_log_bps"]
          .map(key=>avg(row.marks.map(x=>x[key])).toFixed(6)),
        row.marks[0].observations.toLocaleString("en-US")];
      fields.forEach(value=>add(tr,"td",String(value)));
    }
    el("results").replaceChildren(table);
    el("status").textContent = rows.length + " comparisons · " +
      (size.value === "5" ? "structural extrapolation to an unseen route length" : "matched observed quote support") +
      (el("cadence").value === "5" ? " · two fixed neural arms at five-second spacing" : "");
  }
  fetch("fx-cycles-v1.json").then(r=>{
    if (!r.ok) throw Error("Missing cycle benchmark");
    return r.json();
  }).then(data=>{
    if (data.format !== "phaseweave.fx-cycle-browser.v1") throw Error("Unexpected benchmark schema");
    for (const key of ["fold","length","tenor","cadence","cohort","detail"]) el(key).addEventListener("change",()=>render(data));
    render(data);
  }).catch(()=>{el("status").textContent="The verified benchmark could not load.";});
})();
