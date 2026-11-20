"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const node = (tag, text) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const settings = {
    cadence_s: ["Decision resolution", " s"],
    max_compute_ms: ["Decision compute budget", " ms"],
    route_width: ["Routes searched", ""],
    confirmations: ["Consecutive confirmations", ""],
  };
  const actions = {
    proposal: ["Proposed", "--violet"], fill: ["Paper fill", "--state-fill"],
    closed: ["Closed", "--jade"], expiration: ["Expired", "--state-loss"],
    flattened: ["Unwind", "--state-caution"], profile: ["Settings", "--state-info"],
  };
  const chart = $("action-chart");
  const forms = new Map();
  let state;
  let visible = [];
  let markers = [];
  let shown = "";
  const time = stamp => new Date(stamp).toISOString().slice(11, 19);
  const fmt = (value, places) => Number.isFinite(value) ? value.toFixed(places) : "—";
  const key = e => [e.utc, e.model, e.type, e.detail?.leg || 0, e.detail?.active?.revision || 0].join("|");
  const color = name => getComputedStyle(chart).getPropertyValue(name).trim();

  function formFor(model) {
    const form = node("form");
    form.className = "profile-entry";
    form.dataset.model = model.id;
    const fields = node("div");
    fields.className = "profile-inputs";
    const inputs = new Map();
    for (const [field, [label, unit]] of Object.entries(settings)) {
      const select = node("select");
      select.name = field;
      for (const value of state.controls.choices[field]) select.append(new Option(value + unit, value));
      const wrapper = node("label", label);
      wrapper.append(select);
      fields.append(wrapper);
      inputs.set(field, select);
    }
    const apply = node("button", "Apply settings");
    apply.type = "submit";
    const status = node("p");
    status.className = "profile-status";
    status.setAttribute("role", "status");
    const search = node("p");
    search.className = "route-summary";
    const item = {inputs, status, search, revision: 0, dirty: false, busy: false};
    form.append(node("h3", model.name), fields, apply, status, search);
    form.addEventListener("change", () => {
      item.dirty = true;
      status.textContent = "Changes ready to apply";
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      item.busy = apply.disabled = true;
      status.textContent = "Applying…";
      try {
        const response = await fetch("/api/paper-tournament/profile", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            model: model.id, revision: item.revision,
            settings: Object.fromEntries([...inputs].map(([k, input]) => [k, Number(input.value)])),
          }), signal: AbortSignal.timeout(2500),
        });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 409) item.dirty = false;
          throw Error(body.error || "Settings were rejected");
        }
        item.revision = body.profile.revision;
        item.dirty = false;
        status.textContent = "Revision " + item.revision + " active";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        item.busy = apply.disabled = false;
      }
    });
    $("profile-forms").append(form);
    forms.set(model.id, item);
    return item;
  }

  function updateForms() {
    $("paper-controls").hidden = !state.controls;
    if (!state.controls) return;
    for (const model of state.models) {
      const item = forms.get(model.id) || formFor(model);
      if (!item.dirty && !item.busy && model.profile.revision >= item.revision) {
        item.revision = model.profile.revision;
        for (const [field, input] of item.inputs) input.value = model.profile[field];
        item.status.textContent = "Revision " + item.revision + " · p95 " +
          fmt(model.compute_p95_ms, 2) + " ms · " + model.compute_sample_count + " samples";
      }
      const s = model.last_search;
      item.search.textContent = s ? [
        time(Date.parse(s.utc)) + " UTC · " + (s.blocked_by || "Proposed"),
        ...s.candidates.map(c => c.route + " · " + fmt(c.forecast_bps, 2) +
          " forecast / " + fmt(c.depth_bps, 2) + " depth bp"),
        "Confirmed " + s.confirmations + " / " + model.profile.confirmations,
      ].join("\n") : "Waiting for an eligible forecast under this revision.";
    }
  }

  function inspect() {
    const box = $("action-detail");
    const action = visible.find(e => key(e) === $("action-focus").value);
    if (!action) {
      box.replaceChildren(node("p", "No recorded paper actions in this window."));
      return;
    }
    const d = action.detail || {};
    const name = state.models.find(m => m.id === action.model)?.name || action.model;
    const revision = d.profile_revision || d.active?.revision;
    const heading = [time(action.t) + " UTC", name, actions[action.type][0], revision && "revision " + revision];
    if (d.active) heading.push(d.active.cadence_s + " s cadence", d.active.max_compute_ms + " ms budget",
      d.active.route_width + (d.active.route_width === 1 ? " route" : " routes"),
      d.active.confirmations + (d.active.confirmations === 1 ? " confirmation" : " confirmations"));
    if (d.trade_pnl !== undefined) heading.push(fmt(d.trade_pnl, 5) + " USDT realized");
    if (d.amount !== undefined) heading.push(d.amount + " " + (d.inventory || ""));
    if (d.observed_net_bps !== undefined) heading.push(fmt(d.observed_net_bps, 3) + " executable log bp");
    if (d.stranded) heading.push("Residual inventory in " + d.stranded.asset);
    if (d.book_id) heading.push("source book " + d.book_id);
    box.replaceChildren(node("p", heading.filter(Boolean).join(" · ")));
    const route = d.route || d.stranded?.route || d.recovered_paper_inventory?.route;
    if (!route) return;
    const steps = node("ol");
    steps.className = "action-detail-route";
    steps.setAttribute("aria-label", "Paper cycle route in execution order");
    route.split(" → ").forEach((asset, i) => {
      const step = node("li", i ? "→ " + asset : asset);
      step.dataset.active = String(i === (d.leg ?? (action.type === "closed" ? 3 : 0)));
      steps.append(step);
    });
    box.append(steps);
  }

  function plot() {
    const {width, height} = chart.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    chart.width = Math.round(width * scale);
    chart.height = Math.round(height * scale);
    const c = chart.getContext("2d");
    c.scale(scale, scale);
    c.font = "11px ui-monospace, monospace";
    c.fillStyle = color("--muted");
    markers = [];
    const latest = Date.parse(state?.latest_utc);
    if (!Number.isFinite(latest) || !state.models.length) {
      c.fillText("Waiting for the live paper engine.", 12, height / 2);
      return;
    }
    const step = Number($("action-bin").value) * 1000;
    const end = Math.max(latest, Math.ceil(latest / step) * step);
    const start = end - Number($("action-window").value) * 1000;
    visible = (state.action_feed || state.recent).filter(e => Object.hasOwn(actions,e.type) && e.model)
      .map(e => ({...e, t: Date.parse(e.utc)})).filter(e => e.t >= start && e.t <= end).sort((a,b)=>a.t-b.t);
    const left = width < 540 ? 68 : 148;
    const plotWidth = Math.max(1, width - left - 24);
    const x = t => left + (t - start) * plotWidth / (end - start);
    state.models.forEach((model, i) => {
      const y = 27 + i * 40;
      c.fillStyle = color("--muted");
      c.textAlign = "right";
      const label = width < 540 ? "Model " + (i+1) :
        model.name.split(" · ")[0] + " / " + (model.name.includes("cosine") ? "cosine" : "max-plus");
      c.fillText(label, left - 8, y+4);
      c.strokeStyle = color("--line");
      c.beginPath(); c.moveTo(left, y); c.lineTo(left+plotWidth, y); c.stroke();
      const bins = new Map();
      for (const event of visible.filter(e => e.model === model.id)) {
        const bin = Math.max(start, Math.floor(event.t / step) * step);
        const list = bins.get(bin) || [];
        list.push(event);
        bins.set(bin, list);
      }
      for (const [stamp, list] of bins) {
        const final = list.at(-1);
        const px = x(stamp);
        const radius = Math.min(8, 3 + list.length);
        c.fillStyle = color(actions[final.type][1]);
        c.beginPath(); c.arc(px, y, radius, 0, 2*Math.PI); c.fill();
        if (list.length > 1) {
          c.strokeStyle = color("--muted");
          c.beginPath(); c.arc(px, y, radius+2, 0, 2*Math.PI); c.stroke();
        }
        markers.push({x:px,y,event:final});
      }
    });
    for (let i=0;i<=3;i++) {
      const stamp = start + (end-start)*i/3;
      c.textAlign = i===0 ? "left" : i===3 ? "right" : "center";
      c.fillStyle = color("--muted");
      c.fillText(time(stamp), x(stamp), height-25);
    }
    const signature = visible.map(key).join("\n");
    if (signature === shown) return;
    shown = signature;
    const pick = $("action-focus"), selected = pick.value;
    pick.replaceChildren(...visible.slice().reverse().map(e =>
      new Option(time(e.t) + " · Model " + (state.models.findIndex(m=>m.id===e.model)+1) + " · " + actions[e.type][0], key(e))));
    if (!pick.options.length) pick.append(new Option("No paper actions in this window", ""));
    if (visible.some(e=>key(e)===selected)) pick.value = selected;
    inspect();
  }

  for (const [name, variable] of Object.values(actions)) {
    const legend = node("span", name), swatch = node("i");
    swatch.style.background = "var(" + variable + ")";
    legend.prepend(swatch);
    $("action-legend").append(legend);
  }
  $("action-window").addEventListener("change", plot);
  $("action-bin").addEventListener("change", plot);
  $("action-focus").addEventListener("change", inspect);
  chart.addEventListener("click", e => {
    const {left, top} = chart.getBoundingClientRect();
    const nearby = markers.find(m => Math.hypot(m.x-(e.clientX-left),m.y-(e.clientY-top)) <= 10);
    if (nearby) {
      $("action-focus").value = key(nearby.event);
      inspect();
    }
  });
  new ResizeObserver(plot).observe(chart);
  document.addEventListener("paper-theme", plot);
  document.addEventListener("paper-status", ({detail}) => {
    if (state?.started_utc !== detail.started_utc) {
      shown = "pending";
      forms.clear();
      $("profile-forms").replaceChildren();
    }
    state = detail;
    updateForms();
    plot();
  });
})();
