"use strict";

const element = (id) => document.getElementById(id);
const release = element("release"), instrument = element("instrument"), minute = element("event-minute");
const canvas = element("event-chart");
let cases, playback;

function instrumentLabel(id) {
  const [, market, product] = id.split(":");
  return product.replace("_", " / ") + (market === "spot" ? " · Spot" : " · USDT futures");
}

function draw(series, index) {
  const {width, height} = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue("--" + name).trim();
  ctx.scale(ratio, ratio);
  const x = (i) => 48 + (width - 61) * i / (series.length - 1);
  const bound = Math.max(.03, ...series.map((row) => Math.abs(row.relative_vwap_percent ?? 0)));
  const y = (v) => 63 - 46 * v / bound;
  const maxCount = Math.max(1, ...series.map((row) => row.trades));
  const end = height - 23;
  ctx.font = "11px monospace";
  ctx.fillStyle = color("muted");
  ctx.fillText(bound.toFixed(2) + "%", 0, 20);
  ctx.fillText("0%", 0, 66);
  ctx.fillText((-bound).toFixed(2) + "%", 0, 111);
  ctx.fillText("Trades", 0, 150);
  ctx.strokeStyle = color("faint");
  ctx.beginPath(); ctx.moveTo(x(0), y(0)); ctx.lineTo(x(series.length - 1), y(0)); ctx.stroke();
  ctx.fillStyle = color("jade");
  series.forEach((row, i) => {
    const bar = row.trades * (end - 127) / maxCount;
    ctx.fillRect(x(i) - 1, end - bar, Math.max(1, Math.min(4, (width - 61) / series.length)), bar);
  });
  ctx.strokeStyle = color("copper");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let contiguous = false;
  series.forEach((row, i) => {
    if (row.relative_vwap_percent == null) { contiguous = false; return; }
    if (contiguous) ctx.lineTo(x(i), y(row.relative_vwap_percent));
    else ctx.moveTo(x(i), y(row.relative_vwap_percent));
    contiguous = true;
  });
  ctx.stroke();
  const marker = (position, style) => {
    ctx.strokeStyle = style;
    ctx.beginPath(); ctx.moveTo(x(position), 10); ctx.lineTo(x(position), end); ctx.stroke();
  };
  ctx.setLineDash([3, 4]); marker(30, color("faint")); ctx.setLineDash([]);
  marker(index, color("text"));
  ctx.fillStyle = color("muted");
  ctx.fillText("−30 m", x(0), end + 15);
  ctx.fillText("Release", x(30) - 19, end + 15);
  ctx.fillText("+45 m", width - 43, end + 15);
}

function render() {
  if (!cases) return;
  const event = cases[+release.value];
  const {series} = event.instruments[+instrument.value];
  const index = +minute.value, row = series[index];
  const time = new Date(Date.parse(event.release_utc) + 60_000 * row.minute);
  element("event-time").dateTime = time.toISOString();
  element("event-time").textContent = time.toISOString().slice(11, 16) + " UTC";
  draw(series, index);
  const table = element("current-minute");
  table.replaceChildren();
  [["Recorded trades", row.trades.toLocaleString()],
    ["VWAP change", row.relative_vwap_percent == null ? "Unavailable" : row.relative_vwap_percent.toFixed(4) + "%"],
    ["Matching media records available", String(row.news_available)]].forEach(([label, value]) => {
    const line = table.insertRow();
    const th = document.createElement("th");
    th.scope = "row"; th.textContent = label; line.append(th);
    line.insertCell().textContent = value;
  });
  const bucket = event.concurrent_coverage.filter((item) => Date.parse(item.utc) < time.getTime()).at(-1);
  element("coverage").textContent = bucket ?
    `Latest available media batch: ${bucket.articles} matching records, mean GDELT tone ${bucket.mean_tone.toFixed(2)}.` :
    "No matching media batch is available at the selected time.";
  element("release-source").href = event.official_url;
  element("release-summary").textContent = time.getTime() <= Date.parse(event.release_utc) ?
    "At this replay time, the statement has not entered the observation graph." :
    `The Federal Reserve's ${event.release_utc.slice(0, 10)} statement is now available in the observation graph.`;
}

function updateInstruments() {
  const event = cases[+release.value];
  instrument.replaceChildren(...event.instruments.map((item, index) => new Option(instrumentLabel(item.id), index)));
  minute.value = "30";
  render();
}

function stop() {
  clearInterval(playback);
  playback = null;
  const button = element("event-play");
  button.textContent = "Play";
  button.setAttribute("aria-pressed", "false");
}

element("event-play").addEventListener("click", () => {
  if (!cases || playback) { stop(); return; }
  if (+minute.value === +minute.max) minute.value = "0";
  const button = element("event-play");
  button.textContent = "Pause";
  button.setAttribute("aria-pressed", "true");
  playback = setInterval(() => {
    if (+minute.value === +minute.max) { stop(); return; }
    minute.value = String(+minute.value + 1);
    render();
  }, 300);
});
release.addEventListener("change", () => { stop(); updateInstruments(); });
instrument.addEventListener("change",render);
minute.addEventListener("input",render);
new ResizeObserver(render).observe(canvas);

const theme = (value) => {
  document.documentElement.dataset.theme = value;
  for (const button of document.querySelectorAll("button[data-theme]")) {
    button.setAttribute("aria-pressed", String(button.dataset.theme === value));
  }
  try { localStorage.setItem("phaseweave-theme", value); } catch {}
  render();
};
document.querySelectorAll("button[data-theme]").forEach((button) => button.addEventListener("click", () => theme(button.dataset.theme)));
try { theme(localStorage.getItem("phaseweave-theme") || "dark"); } catch {}
fetch("event-data.json").then((response) => {
  if (!response.ok) throw new Error("aggregate unavailable");
  return response.json();
}).then((data) => {
  cases = data;
  release.replaceChildren(...data.map((event, index) => new Option(event.release_utc.slice(0, 10), index)));
  updateInstruments();
}).catch(() => { element("event-error").textContent = "The event observations could not load."; });
