"use strict";

(() => {
  const el = name => document.getElementById("k5-" + name);
  const architecture = {
    gcn:"GCN", gat:"GAT", mpnn:"MPNN", tokengt:"TokenGT-style",
    gcn_tokengt:"GCN + token attention", gat_tokengt:"GAT + token attention",
    mpnn_tokengt:"MPNN + token attention", ridge:"Route ridge", hgb:"Boosted trees",
    hodge_ridge:"Hodge ridge", persistence:"Persistence"
  };
  const controls = ["scope", "length", "tenor", "cadence", "support", "detail", "contrast"];
  const fmt = value => value.toFixed(6);
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const svg = (name, attrs) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  };

  function table(caption, columns, rows) {
    const element = document.createElement("table");
    element.createCaption().textContent = caption;
    const header = element.createTHead().insertRow();
    for (const column of columns) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = column;
      header.append(cell);
    }
    const body = element.createTBody();
    for (const [label, ...values] of rows) {
      const row = body.insertRow();
      const head = document.createElement("th");
      head.scope = "row";
      head.textContent = label;
      row.append(head);
      for (const value of values) row.insertCell().textContent = value;
    }
    return element;
  }

  function scores(data, length, tenor, cadence) {
    const run = data.runs[cadence];
    const values = data.summaries[cadence][el("support").value][el("scope").value];
    const group = el("detail").value === "arm";
    const rows = new Map();
    for (const [key, route] of Object.entries(values)) {
      const cell = route[length]?.[tenor];
      if (!cell?.observations) continue;
      const model = run.graph[key];
      const linear = run.dlinear[key];
      const id = group && (model || linear) ? key.slice(0, key.lastIndexOf("-")) : key;
      const name = model ? architecture[model.backbone] : (linear ? "DLinear" : architecture[key]);
      const row = rows.get(id) ?? {name, model, linear, cells: [], seeds: []};
      row.cells.push(cell);
      if (model || linear) row.seeds.push((model ?? linear).seed);
      rows.set(id, row);
    }
    const ordered = [...rows.values()].sort((a, b) => mean(a.cells.map(c => c.mae_log_bps)) - mean(b.cells.map(c => c.mae_log_bps)));
    const rendered = ordered.map(({name, model, linear, cells, seeds}) => [
      name, model?.propagation ?? "—", model && model.propagation !== "classical" ? model.radix + " × " + model.wires : "—",
      model?.attention ?? "—", model ? (model.supervision === "short" ? "3–4" : "3–5") : "—",
      seeds.length ? (group ? seeds.length + " seeds" : seeds[0]) : "—",
      fmt(mean(cells.map(c => c.mae_log_bps))), fmt(mean(cells.map(c => c.rmse_log_bps))),
      (model ?? linear)?.parameters.toLocaleString("en-US") ?? "—", cells[0].observations.toLocaleString("en-US")
    ]);
    el("results").replaceChildren(table("Indicative margin errors in log basis points. Lower is better.",
      ["Architecture", "Patch", "Levels × wires", "Attention", "Graph training legs", "Seed", "MAE", "RMSE", "Parameters", "Labels"], rendered));
    el("status").textContent = ordered.length ? ordered.length + " rows · Lowest MAE " + rendered[0][6] + " · " + rendered[0][0] : "No eligible routes.";
  }

  function intervalPlot(entries) {
    if (!entries.length) return "";
    const margin = 42;
    const width = 620;
    const height = 34 + entries.length * 19;
    const extent = Math.max(...entries.flatMap(x => [Math.abs(x.lower_95),Math.abs(x.upper_95),Math.abs(x.delta_mae)]),1e-6);
    const x = value => width / 2 + value / extent * (width / 2 - margin);
    const plot = svg("svg", {viewBox: "0 0 " + width + " " + height, width: "100%", role: "img", "aria-label": "Paired errors and day bootstrap intervals"});
    plot.style.maxWidth = width + "px";
    plot.append(svg("line", {x1:x(0), x2:x(0), y1:0, y2:height-20, stroke:"var(--line)"}));
    entries.forEach((entry, i) => {
      const y = 11 + i*19;
      const dot = svg("circle", {cx:x(entry.delta_mae),cy:y,r:3.5,fill:"var(--copper)"});
      const label = svg("title", {});
      label.textContent = entry.summary + " · " + fmt(entry.delta_mae);
      dot.append(label);
      plot.append(svg("line", {x1:x(entry.lower_95),x2:x(entry.upper_95),y1:y,y2:y,stroke:"var(--muted)","stroke-width":2}), dot);
    });
    for (const sign of [-1,0,1]) {
      const label = svg("text", {x:x(sign*extent), y:height-3, fill:"var(--muted)","text-anchor":"middle","font-size":11});
      label.textContent = fmt(sign * extent);
      plot.append(label);
    }
    return plot;
  }

  function contrasts(data, length, tenor, cadence) {
    const kind = el("contrast").value;
    const entries = data.paired_contrasts.filter(x => x.kind === kind && (!x.cadence_seconds || String(x.cadence_seconds) === cadence))
      .flatMap(x => {
        const cell = (x.available_chf_routes ?? x.common_chf_routes)[length]?.[tenor];
        return cell ? [{...cell, summary:x.left + " − " + x.right, right:x.right, left:x.left}] : [];
      });
    el("paired-scope").textContent = entries.length
      ? (kind === "history_spacing" ? "Common-support comparison. Four frames minus sixteen." : "All eligible CHF-containing routes at the chosen history spacing.") + " Negative differences favor the left arm."
      : "This contrast was measured at the other history spacing.";
    el("plot").replaceChildren(intervalPlot(entries));
    el("paired").replaceChildren(...(entries.length ? [table("Paired MAE differences in log basis points.",
      ["Left arm", "Right arm", "Difference", "Interval low", "Interval high", "Labels", "UTC days"],
      entries.map(x => [x.left, x.right, fmt(x.delta_mae), fmt(x.lower_95), fmt(x.upper_95), x.pairs, x.utc_day_blocks]))] : []));
  }

  function render(data) {
    const length = el("length");
    length.options[2].disabled = el("scope").value === "non_chf_routes";
    if (length.options[2].disabled && length.value === "5") length.value = "4";
    const tenor = el("tenor").value;
    const cadence = el("cadence").value;
    scores(data, length.value, tenor, cadence);
    contrasts(data, length.value, tenor, cadence);
  }

  fetch("fx-cycles-k5-v1.json").then(response => {
    if (!response.ok) throw Error("Missing benchmark");
    return response.json();
  }).then(data => {
    if (data.format !== "phaseweave.fx-cycle-k5-browser.v1") throw Error("Unexpected schema");
    for (const control of controls) el(control).addEventListener("change", () => render(data));
    render(data);
  }).catch(() => { el("status").textContent = "Verified scores could not be loaded."; });
})();
