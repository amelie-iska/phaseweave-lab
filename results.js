"use strict";

let records;
const item = (id) => document.getElementById(id);
const number = (value, digits = 5) => value == null ? "—" : value.toFixed(digits);
const formatCount = new Intl.NumberFormat("en", {notation:"compact", maximumFractionDigits:2});
const readTheme = () => {
  try { return localStorage.getItem("phaseweave-theme") || "dark"; }
  catch { return "dark"; }
};

function table(destination, columns, data) {
  const box = document.createElement("div");
  box.className = "table-overflow";
  const result = document.createElement("table");
  const head = result.createTHead().insertRow();
  columns.forEach((name) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    head.append(cell);
  });
  const body = result.createTBody();
  for (const row of data) {
    const target = body.insertRow();
    row.forEach((value) => { target.insertCell().textContent = value; });
  }
  box.append(result);
  destination.replaceChildren(box);
}

function drawBars(canvas, values, baseline) {
  const {width, height} = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  if (!width || !values.length) return;
  const ctx = canvas.getContext("2d"), css = getComputedStyle(document.documentElement);
  const c = (name) => css.getPropertyValue("--" + name).trim();
  ctx.scale(dpr, dpr);
  const valuesOnly = values.map((point) => point.value);
  const min = Math.min(...valuesOnly, baseline) - .002;
  const max = Math.max(...valuesOnly, baseline) + .003;
  const floor = height - 29, usableWidth = width - 66;
  const coord = (value) => 14 + (max - value) * (floor - 14) / (max - min);
  const cell = usableWidth / values.length, x = (index) => 54 + (index + .5) * cell;
  ctx.textAlign = "left";
  ctx.font = "12px ui-monospace, monospace";
  [min, (min + max) / 2, max].forEach((value) => {
    const y = coord(value);
    ctx.fillStyle = c("muted");
    ctx.fillText(number(value, 3), 0, y+4);
    ctx.strokeStyle = c("faint");
    ctx.beginPath();
    ctx.moveTo(51,y);
    ctx.lineTo(width-10,y);
    ctx.stroke();
  });
  ctx.strokeStyle = c("muted");
  ctx.setLineDash([5,4]);
  ctx.beginPath();
  ctx.moveTo(52, coord(baseline));
  ctx.lineTo(width-10, coord(baseline));
  ctx.stroke();
  ctx.setLineDash([]);
  values.forEach((point, index) => {
    ctx.fillStyle = c(point.transfer ? "copper" : "jade");
    ctx.beginPath();
    ctx.arc(x(index), coord(point.value), values.length > 12 ? 4 : 5.5, 0, 2*Math.PI);
    ctx.fill();
    if (values.length < 10 || index % 4 === 0 || index >= values.length - 2) {
      ctx.textAlign = "center";
      ctx.fillStyle = c("muted");
      ctx.fillText(point.label, x(index), height-8);
    }
  });
}

function renderCampaign() {
  if (!records) return;
  const view = item("series").value;
  const report = records.campaign;
  if (view === "roster") {
    drawBars(item("campaign-chart"), report.runs.map((row, index) => ({
      label: row.run.startsWith("transfer") ? (index === 24 ? "10M" : "35M") : String(index+1),
      value: row.best_validation, transfer: row.run.startsWith("transfer"),
    })), records.validation_persistence);
    table(item("campaign-table"), ["Run","Parameters","Learning rate","Readout ×","Attention ×","Seed","Validation MAE"],
      report.runs.map((row) => [row.run,formatCount.format(row.parameters),row.config.learning_rate,
        row.config.readout_multiplier,row.config.attention_multiplier,row.config.seed,number(row.best_validation)]));
    item("campaign-note").textContent = "The dashed line is validation persistence MAE. Copper identifies the wider transfers.";
    return;
  }
  const chosen = report.holdout.filter((row) => row.split === view);
  drawBars(item("campaign-chart"), chosen.map((row) => ({
    label: row.run.replace("transfer-", "w").replace("proxy-", "p"),
    value: row.learned.mae_bps, transfer: row.run.startsWith("transfer"),
  })), chosen[0].persistence.mae_bps);
  table(item("campaign-table"), ["Run","Windows","Forecast MAE","Persistence MAE","Paired Δ 95% interval","Positive windows"],
    chosen.map((row) => [row.run,row.rows.toLocaleString(),number(row.learned.mae_bps),number(row.persistence.mae_bps),
      "[" + number(row.mae_delta_bps_ci.lower_95) + ", " + number(row.mae_delta_bps_ci.upper_95) + "]",
      row.learned.positive_windows.toLocaleString()]));
  item("campaign-note").textContent = "Negative error differences favor the forecast. The dashed line is current-margin persistence.";
}

function renderAblation() {
  if (!records) return;
  const ablation = records.phase;
  const split = item("ablation-split").value;
  if (!ablation) return;
  const results = new Map(ablation.holdout.filter((row) => row.split === split).map((row) => [row.run,row]));
  table(item("ablation-table"), ["Features", "Attention", "Seed", "Trainable parameters", "MAE", "Persistence MAE"],
    ablation.runs.map((run) => {
      const evaluation = results.get(run.run);
      return [run.config.phase_variant.replaceAll("_", " "),run.config.attention,run.config.seed,
        run.parameters.toLocaleString(),number(evaluation?.learned.mae_bps ?? run.best_validation),
        number(evaluation?.persistence.mae_bps ?? records.validation_persistence)];
    }));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme)));
  try { localStorage.setItem("phaseweave-theme",theme); } catch {}
  renderCampaign();
}

document.querySelectorAll("[data-theme-choice]").forEach((button) =>
  button.addEventListener("click",() => applyTheme(button.dataset.themeChoice)));
item("series").addEventListener("change",renderCampaign);
item("ablation-split").addEventListener("change",renderAblation);
window.addEventListener("resize",renderCampaign);
applyTheme(readTheme());
fetch("experiment-data.json").then((response) => {
  if (!response.ok) throw new Error("result export unavailable");
  return response.json();
}).then((data) => {
  records = data;
  renderCampaign();
  renderAblation();
}).catch(() => { item("result-status").textContent = "The experiment data could not load."; });
