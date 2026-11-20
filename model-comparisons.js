"use strict";

(() => {
  const find = name => document.getElementById("comparison-" + name);
  const [family, status, study, search] = ["family","status","study","search"].map(find);
  const titleStatus = {measured:"PhaseWeave measurement", external:"Published external result",
                       pending:"Pending", runtime:"Runtime only"};
  const variantColumns = {backbone:"Backbone",feature:"Feature patch",spatial:"Spatial attention",attention:"Temporal / outer attention"};
  const controls = document.querySelector(".comparison-filters");
  const query = new URLSearchParams(location.search);
  const themes = [...document.querySelectorAll("[data-comparison-theme]")];
  const state = {partitions:[], sort:new Map()};

  function item(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function url(value) {
    if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value) || /^https:\/\//.test(value)) return value;
    return null;
  }

  function link(label, href) {
    const safe = url(href);
    const node = item(safe ? "a" : "span",label);
    if (safe) node.href = safe;
    return node;
  }

  function available() {
    return state.partitions.filter(group => (!family.value || group.family === family.value) &&
      (!status.value || group.rows.some(row => row.status === status.value)));
  }

  function buildStudyOptions(selected) {
    const displayed = available();
    study.replaceChildren(new Option("All studies",""), ...displayed.map(g=>new Option(g.label,g.id)));
    study.value = displayed.some(g=>g.id === selected) ? selected : "";
  }

  function updateQuery() {
    const next = new URL(location.href);
    for (const [key,input] of Object.entries({task:family,evidence:status,study,q:search})) {
      if (input.value) next.searchParams.set(key,input.value);
      else next.searchParams.delete(key);
    }
    history.replaceState(null,"",next);
  }

  function receiptPanel(group) {
    const details = item("details");
    details.append(item("summary","Receipts and checksums"));
    const list = item("ul");
    for (const source of group.sources) {
      const entry = item("li");
      entry.append(link(source.name,source.href),item("code",source.sha256));
      list.append(entry);
    }
    details.append(list);
    return details;
  }

  function orderRows(group, rows) {
    const sorting = state.sort.get(group.id);
    if (!sorting) return rows;
    const {key, direction} = sorting;
    return [...rows].sort((a,b) => {
      const left = a.values[key], right = b.values[key];
      if (typeof left !== "number") return typeof right === "number" ? 1 : 0;
      if (typeof right !== "number") return -1;
      return direction*(left-right);
    });
  }

  function drawGroup(group, rows) {
    const frame = item("section");
    frame.className = "comparison-study";
    frame.id = group.id;
    const head = item("header");
    const label = item("h2",group.label);
    label.id = "comparison-title-" + group.id;
    head.append(label,item("p",group.scope));
    if (group.metric) {
      const metric = item("p",group.metric);
      metric.className = "comparison-metric";
      head.append(metric);
    }
    frame.append(head);

    const wrap = item("div");
    wrap.className = "comparison-scroll";
    wrap.tabIndex = 0;
    wrap.setAttribute("role","region");
    wrap.setAttribute("aria-labelledby",label.id);
    const grid = item("table");
    grid.setAttribute("aria-labelledby",label.id);
    const top = grid.createTHead().insertRow();
    const header = text => {
      const cell = item("th",text);
      cell.scope = "col";
      top.append(cell);
      return cell;
    };
    const variants = Object.entries(variantColumns).filter(([key])=>rows.some(row=>row.variant?.[key]));
    if (variants.length) grid.dataset.variant = "";
    if (!group.columns.length) grid.dataset.notes = "";
    header("Model or control");
    variants.forEach(([,label])=>header(label));
    for (const column of group.columns) {
      const cell = header("");
      const enabled = column.order !== "none" && rows.some(row=>typeof row.values[column.key] === "number");
      if (!enabled) { cell.textContent = column.name; continue; }
      const sorting = state.sort.get(group.id);
      const direction = sorting?.key === column.key ? sorting.direction : null;
      if (direction !== null) cell.setAttribute("aria-sort",direction === 1 ? "ascending" : "descending");
      const button = item("button",column.name + (direction === null ? "" : direction === 1 ? " ↑" : " ↓"));
      button.type = "button";
      button.id = `comparison-sort-${group.id}-${column.key}`;
      button.setAttribute("aria-label","Sort by " + column.name);
      button.addEventListener("click",() => {
        state.sort.set(group.id,{key:column.key,direction:direction === null ?
          column.order === "higher" ? -1 : 1 : -direction});
        paint();
        document.getElementById(button.id)?.focus({preventScroll:true});
      });
      cell.append(button);
    }
    if (rows.some(r=>r.status !== "measured")) header("Evidence");
    if (!group.columns.length) header("Scope");

    const body = grid.createTBody();
    for (const row of orderRows(group,rows)) {
      const line = body.insertRow();
      const title = item("th");
      title.scope = "row";
      title.append(row.source ? link(row.name,row.source) : document.createTextNode(row.name));
      if (row.note && group.columns.length) title.append(item("small",row.note));
      line.append(title);
      for (const [key] of variants) line.insertCell().textContent = row.variant?.[key] || "—";
      for (const column of group.columns) {
        const cell = line.insertCell();
        const value = row.values[column.key];
        if (typeof value === "number") {
          cell.dataset.score = String(value);
          const prefix = group.metric.includes("delta") && value > 0 ? "+" : "";
          cell.textContent = prefix + (column.places === 0 ? value.toLocaleString("en-US") : value.toFixed(column.places)) + column.suffix;
        } else cell.textContent = value || "—";
      }
      if (rows.some(r=>r.status !== "measured")) line.insertCell().textContent = titleStatus[row.status] || row.status;
      if (!group.columns.length) line.insertCell().textContent = row.note;
    }
    wrap.append(grid);
    frame.append(wrap,receiptPanel(group));
    return frame;
  }

  function paint() {
    const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const display = [];
    let count = 0;
    for (const group of available()) {
      if (study.value && group.id !== study.value) continue;
      const matches = group.rows.filter(row => {
        if (status.value && row.status !== status.value) return false;
        const content = [row.name,row.note,group.label,...Object.values(row.variant || {})].join(" ").toLowerCase();
        return terms.every(word=>content.includes(word));
      });
      if (matches.length) { display.push(drawGroup(group,matches)); count += matches.length; }
    }
    find("results").replaceChildren(...display);
    find("summary").textContent = count ?
      `${count.toLocaleString("en-US")} ${count===1?"entry":"entries"} across ${display.length} ${display.length===1?"study":"studies"}` :
      "No matching entries. Try a broader task, study, or search.";
    updateQuery();
  }

  controls.addEventListener("submit",event=>event.preventDefault());
  for (const filter of [family,status]) filter.addEventListener("change",()=>{buildStudyOptions("");paint();});
  study.addEventListener("change",paint);
  search.addEventListener("input",()=>{ if (search.value.trim()) study.value=""; paint(); });

  function theme(value) {
    document.documentElement.dataset.theme = value;
    themes.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.comparisonTheme===value)));
    try { localStorage.setItem("phaseweave-theme",value); } catch {}
  }
  themes.forEach(button=>button.addEventListener("click",()=>theme(button.dataset.comparisonTheme)));
  try { theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark"); } catch {}

  fetch("model-comparisons.json").then(response => {
    if (!response.ok) throw new Error("Comparison inventory unavailable");
    return response.json();
  }).then(data => {
    if (data.version !== 1 || !Array.isArray(data.partitions) || !data.partitions.length) throw new Error("Unsupported inventory");
    state.partitions = data.partitions;
    const tasks = [...new Set(state.partitions.map(p=>p.family))];
    family.replaceChildren(new Option("All tasks",""),...tasks.map(name=>new Option(name,name)));
    family.value = tasks.includes(query.get("task")) ? query.get("task") : "";
    status.value = Object.hasOwn(titleStatus,query.get("evidence")) ? query.get("evidence") : "";
    search.value = query.get("q") || "";
    const initial = query.get("study") ?? (query.has("task")||query.has("evidence")||query.has("q") ? "" : state.partitions[0].id);
    buildStudyOptions(initial);
    [family,status,study,search].forEach(control=>{control.disabled=false;});
    paint();
  }).catch(() => { find("summary").textContent = "Could not load the comparison inventory. Reload to retry."; });
})();
