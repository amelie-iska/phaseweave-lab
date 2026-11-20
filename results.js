"use strict";

let records;
let convergence;
let baselines;
let semiring;
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

function renderConvergence() {
  if (!convergence?.length) return;
  const width = Number(item("convergence-width").value);
  const run = convergence.find((entry) => entry.width === width);
  if (!run) return;
  const {summary, epochs} = run;
  drawBars(item("convergence-chart"), epochs.map((epoch) => ({
    label: String(epoch.epoch), value: epoch.mae_bps, transfer: epoch.epoch === summary.best_epoch,
  })), epochs[0].persistence_mae_bps);
  const reason = summary.stop_reason.replaceAll("_", " ");
  item("convergence-note").textContent = `Stopped after ${summary.epochs} epochs (${reason}). Copper marks the selected epoch ${summary.best_epoch}. The dashed line is persistence.`;
  table(item("convergence-holdouts"), ["Split", "Model MAE", "Persistence MAE", "Paired Δ 95% interval"],
    Object.entries(summary.holdout).map(([name, scores]) => [
      {test:"October holdout", new_asset:"Unseen CHF", stress:"September stress"}[name],
      number(scores.learned.mae_bps), number(scores.persistence.mae_bps),
      `[${number(scores.interval.lower_95)}, ${number(scores.interval.upper_95)}]`,
    ]));
  table(item("convergence-epochs"), ["Epoch", "Validation MAE", "Validation RMSE", "Training loss", "Epoch seconds"],
    epochs.map((epoch) => [epoch.epoch, number(epoch.mae_bps), number(epoch.rmse_bps),
      number(epoch.loss), number(epoch.seconds, 1)]));
}

function renderSemiring() {
  if (!semiring || !records) return;
  const split = item("semiring-split").value;
  const evaluated = new Map(semiring.holdout.filter((row) => row.split === split).map((row) => [row.run,row]));
  const names = {circuit_coherent:"Coherent", circuit_dephased:"Dephased", circuit_maxplus:"Max-plus"};
  table(item("semiring-table"), ["Circuit", "Seed", "Trainable parameters", "MAE", "Persistence MAE"],
    semiring.runs.map((run) => {
      const row = evaluated.get(run.run);
      return [names[run.config.phase_variant], run.config.seed, run.parameters.toLocaleString(),
        number(row?.learned.mae_bps ?? run.best_validation),
        number(row?.persistence.mae_bps ?? records.validation_persistence)];
    }));
}

function renderBaselines() {
  if (!baselines || !convergence?.length) return;
  const split = item("baseline-split").value;
  const budget = item("baseline-budget").value;
  const runs = baselines[budget];
  const persistence = runs.find((run) => run.name === "Persistence").splits[split].metrics.mae_bps;
  const phaseweave = convergence.find((run) => run.width === 200).summary;
  const phaseScore = split === "validation" ? phaseweave.best_validation.mae_bps :
    phaseweave.holdout[split].learned.mae_bps;
  const series = runs.map((run) => ({
    label: run.name, value: run.splits[split].metrics.mae_bps, parameters: run.parameters, budget: run.best_epoch ?? "—",
  }));
  series.push({label:"PhaseWeave 2M", value:phaseScore, parameters:2020265, budget:phaseweave.best_epoch, transfer:true});
  series.sort((a, b) => a.value - b.value);
  drawBars(item("baseline-chart"), series.map((row, index) => ({...row, label:String(index + 1)})), persistence);
  table(item("baseline-table"), ["Rank", "Forecast", "Trainable parameters", "Selected epoch", "MAE (log bps)"],
    series.map((row, index) => [index+1, row.label, row.parameters?.toLocaleString() ?? "—", row.budget, number(row.value)]));
  item("baseline-note").textContent = budget === "23" ?
    "The ten backbone adaptations and PhaseWeave saw 23 full passes. They used respectively 5,888 and 23,552 updates with different parameter counts. Persistence and histogram boosting are fixed controls." :
    "The ten compact backbone adaptations saw three full passes and PhaseWeave saw 23. Persistence and histogram boosting are fixed controls.";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme)));
  try { localStorage.setItem("phaseweave-theme",theme); } catch {}
  renderCampaign();
  renderConvergence();
  renderBaselines();
}

document.querySelectorAll("[data-theme-choice]").forEach((button) =>
  button.addEventListener("click",() => applyTheme(button.dataset.themeChoice)));
item("series").addEventListener("change",renderCampaign);
item("ablation-split").addEventListener("change",renderAblation);
item("semiring-split").addEventListener("change",renderSemiring);
item("convergence-width").addEventListener("change",renderConvergence);
item("baseline-split").addEventListener("change",renderBaselines);
item("baseline-budget").addEventListener("change",renderBaselines);
window.addEventListener("resize",() => { renderCampaign(); renderConvergence(); renderBaselines(); });
applyTheme(readTheme());
fetch("experiment-data.json").then((response) => {
  if (!response.ok) throw new Error("result export unavailable");
  return response.json();
}).then((data) => {
  records = data;
  renderCampaign();
  renderAblation();
  renderSemiring();
}).catch(() => { item("result-status").textContent = "The experiment data could not load."; });
fetch("semiring-data.json").then((response) => {
  if (!response.ok) throw new Error("circuit export unavailable");
  return response.json();
}).then((data) => {
  semiring = data;
  renderSemiring();
}).catch(() => { item("semiring-table").textContent = "Circuit results are unavailable."; });
fetch("convergence-data.json").then((response) => {
  if (!response.ok) throw new Error("epoch export unavailable");
  return response.json();
}).then((data) => {
  convergence = data;
  item("convergence-width").replaceChildren(...data.map((entry) => {
    const option = document.createElement("option");
    option.value = String(entry.width);
    option.textContent = `Width ${entry.width}`;
    return option;
  }));
  renderConvergence();
  renderBaselines();
}).catch(() => { item("convergence-note").textContent = "The epoch data could not load."; });
Promise.all(["baseline-data.json","baseline-23-data.json"].map((file) => fetch(file).then((response) => {
  if (!response.ok) throw new Error("baseline export unavailable");
  return response.json();
}))).then(([short, extended]) => {
  const fixed = short.roster.filter((row) => !row.epochs?.length);
  baselines = {"3":short.roster, "23":[...extended.roster, ...fixed]};
  renderBaselines();
}).catch(() => { item("baseline-note").textContent = "The baseline data could not load."; });
