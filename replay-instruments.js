"use strict";

const ReplayInstruments = (() => {
  const archivePath = "replay.json";
  const csvColumns = [
    "route", "a_observation_utc", "b_observation_utc", "a_example_id", "b_example_id",
    "a_example_label", "b_example_label", "a_source", "b_source", "data_file",
    "a_max_quote_age_ms", "b_max_quote_age_ms", "a_assumed_cost_per_leg_log_bps",
    "b_assumed_cost_per_leg_log_bps", "a_quote_status", "b_quote_status",
    "a_net_quote_margin_log_bps", "b_net_quote_margin_log_bps", "b_minus_a_log_bps",
    "assumption_status",
  ];

  function capture(observation) {
    if (!observation) return null;
    const {selection, frame, result, age, cost} = observation;
    if (!selection?.frames.includes(frame) || !Number.isFinite(Date.parse(frame.utc)) ||
        !Number.isFinite(age) || !Number.isFinite(cost)) return null;
    return {
      example: selection.id,
      label: selection.label,
      source: selection.source,
      utc: frame.utc,
      age,
      cost,
      routes: result.scored.map(route => ({
        label: route.label,
        status: route.fresh ? "Fresh" : route.legs.some(leg => !leg) ? "Missing" : "Stale",
        margin: Number.isFinite(route.score) ? route.score : null,
      })),
    };
  }

  function compare(a, b) {
    if (!a || !b) return null;
    const aByRoute = new Map(a.routes.map(route => [route.label, route]));
    const bByRoute = new Map(b.routes.map(route => [route.label, route]));
    const matchingAssumptions = a.age === b.age && a.cost === b.cost;
    const routes = [...new Set([...aByRoute.keys(), ...bByRoute.keys()])].map(label => {
      const left = aByRoute.get(label), right = bByRoute.get(label);
      const hasMargins = Number.isFinite(left?.margin) && Number.isFinite(right?.margin);
      return {
        label, left, right,
        delta: matchingAssumptions && hasMargins ? right.margin - left.margin : null,
      };
    });
    return {matchingAssumptions, routes};
  }

  function csvCell(value) {
    if (value == null) return "";
    if (typeof value === "number") return String(value);
    const text = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + text.replaceAll('"', '""') + '"';
  }

  function csv(a, b) {
    const comparison = compare(a, b);
    if (!comparison) return "";
    const rows = comparison.routes.map(({label, left, right, delta}) => [
      label, a.utc, b.utc, a.example, b.example, a.label, b.label, a.source, b.source, archivePath,
      a.age, b.age, a.cost, b.cost, left?.status ?? "Unavailable", right?.status ?? "Unavailable",
      left?.margin, right?.margin, delta,
      comparison.matchingAssumptions ? "matching hypothetical costs and quote-age limits" :
        "different quote-age limits or hypothetical costs; delta omitted",
    ]);
    return [csvColumns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  function download(a, b) {
    const url = URL.createObjectURL(new Blob([csv(a,b)], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "phaseweave-replay-comparison.csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function toggleDisabled(control, value) {
    if (control.disabled !== value) control.disabled = value;
  }

  function formatPin(panel, observation) {
    const target = panel.querySelector("dd");
    target.replaceChildren();
    if (!observation) {
      target.textContent = "No observation pinned";
      return;
    }
    const time = document.createElement("time");
    time.dateTime = observation.utc;
    time.textContent = observation.utc.replace("T", " ").replace(/\+00:00$|Z$/, " UTC");
    const source = document.createElement("span");
    source.textContent = `${observation.label} · ${observation.source}`;
    const assumptions = document.createElement("span");
    assumptions.textContent = `${observation.age} ms max age · ${observation.cost} log bps assumed per leg`;
    target.append(time, source, assumptions);
  }

  function formatMargin(route) {
    return Number.isFinite(route?.margin) ? route.margin.toFixed(4) : route?.status ?? "Unavailable";
  }

  function fillTable(table, comparison) {
    table.hidden = !comparison;
    const body = table.querySelector("tbody");
    body.replaceChildren();
    if (!comparison) return;
    for (const {label, left, right, delta} of comparison.routes) {
      const row = body.insertRow();
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.textContent = label;
      row.append(heading);
      row.insertCell().textContent = formatMargin(left);
      row.insertCell().textContent = formatMargin(right);
      row.insertCell().textContent = delta == null ? "—" : delta.toFixed(4);
    }
  }

  function bind({speedMount, compareMount, onSpeed}) {
    let rate;
    if (speedMount) {
      speedMount.innerHTML = `
        <label for="replay-speed-rate">Replay speed</label>
        <select id="replay-speed-rate" title="1× advances a recorded frame every 650 ms" disabled>
          <option value="0.5">0.5×</option><option value="1" selected>1×</option>
          <option value="2">2×</option><option value="4">4×</option>
        </select>`;
      rate = speedMount.querySelector("select");
      rate.addEventListener("change", () => onSpeed(Number(rate.value)));
    }
    function updateSpeed(observation, isLive) {
      if (!speedMount) return;
      if (speedMount.hidden !== isLive) speedMount.hidden = isLive;
      toggleDisabled(rate, !observation);
    }
    if (!compareMount) return {update: updateSpeed};

    compareMount.innerHTML = `
      <h2 id="replay-compare-title">Compare observations</h2>
      <div class="replay-compare-actions">
        <button type="button" id="replay-pin-a" disabled>Pin current as A</button>
        <button type="button" id="replay-pin-b" disabled>Pin current as B</button>
        <button type="button" id="replay-compare-clear" disabled>Clear pins</button>
        <button type="button" id="replay-compare-export" disabled>Export CSV</button>
      </div>
      <dl class="replay-compare-pins">
        <div class="replay-pin" data-pin="A"><dt>Observation A</dt><dd></dd></div>
        <div class="replay-pin" data-pin="B"><dt>Observation B</dt><dd></dd></div>
      </dl>
      <div class="replay-compare-table">
        <table hidden>
          <caption>Indicative quote margins in log basis points</caption>
          <thead><tr><th scope="col">Route</th><th scope="col">A</th><th scope="col">B</th><th scope="col">B − A</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="replay-compare-note" id="replay-compare-status" role="status"></p>`;
    const find = selector => compareMount.querySelector(selector);
    const [pinA, pinB, clear, exportButton] = compareMount.querySelectorAll("button");
    const status = find("#replay-compare-status");
    let a = null, b = null, current = null, live = false;

    function statusText(comparison) {
      let text;
      if (!comparison) text = a || b ? "Pin the other observation to compare." : "Pin two archived replay timestamps.";
      else if (!comparison.matchingAssumptions) text = "The pinned age limits or costs differ. Changes are omitted.";
      else if (comparison.routes.every(route => route.delta == null)) text = "Both pins need fresh quotes on the same route to show a change.";
      else text = "Changes use the pinned quote-age limit and assumed per-leg cost.";
      return live ? text + " Select an archived example to add pins." : text;
    }

    function updateActions() {
      toggleDisabled(pinA, !current);
      toggleDisabled(pinB, !current);
      toggleDisabled(clear, !a && !b);
      toggleDisabled(exportButton, !a || !b);
      const message = statusText(compare(a,b));
      if (status.textContent !== message) status.textContent = message;
    }

    function paint() {
      formatPin(find('[data-pin="A"]'),a);
      formatPin(find('[data-pin="B"]'),b);
      fillTable(find("table"),compare(a,b));
      updateActions();
    }

    pinA.addEventListener("click", () => { a = capture(current); paint(); });
    pinB.addEventListener("click", () => { b = capture(current); paint(); });
    clear.addEventListener("click", () => {
      a = b = null;
      paint();
      if (current) pinA.focus();
    });
    exportButton.addEventListener("click", () => { if (a && b) download(a,b); });
    paint();
    return {update(observation, isLive) {
      updateSpeed(observation, isLive);
      const changed = Boolean(current) !== Boolean(observation) || live !== isLive;
      current = observation;
      live = isLive;
      if (changed) updateActions();
    }};
  }

  return {bind, capture, compare, csv};
})();

if (typeof module !== "undefined") module.exports = ReplayInstruments;
