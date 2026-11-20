"use strict";

const element = (id) => document.getElementById(id);
const canvas = element("scene");
const ctx = canvas.getContext("2d");
const T = Math.PI * 2;
const liveId = "gate-live";
const state = {
  examples: [], frame: 0, step: 1, layer: 0, query: 0, playback: null,
  yaw: -0.16, pitch: 0.64, useNetwork: false, drag: null,
};
const feed = new GatePublicFeed((status) => { element("feed-state").textContent = status; });
const live = () => element("example").value === liveId;
const format = (value, digits = 3) => value == null ? "—" : Number(value).toFixed(digits);

function addCell(row, tag, text, className) {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  row.append(item);
}

function table(container, headers, rows, title) {
  if (title) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    container.append(heading);
  }
  const grid = document.createElement("table");
  grid.setAttribute("aria-label", title || "Computed values");
  const header = grid.createTHead().insertRow();
  headers.forEach((label) => addCell(header, "th", label));
  const body = grid.createTBody();
  rows.forEach((values) => {
    const row = body.insertRow();
    values.forEach((value) => addCell(row, "td", value));
  });
  container.append(grid);
}

function note(container, text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  container.append(paragraph);
}

function selectControl(container, label, options, selected, callback) {
  const wrapper = document.createElement("label");
  wrapper.className = "model";
  wrapper.textContent = label;
  const select = document.createElement("select");
  options.forEach((item, index) => select.add(new Option(item, String(index))));
  select.value = String(Math.min(selected, options.length - 1));
  select.addEventListener("change", () => callback(Number(select.value)));
  wrapper.append(select);
  container.append(wrapper);
}

function inspector(frame, result, pipeline) {
  const panel = element("inspector");
  const previousFocus = panel.contains(document.activeElement) ? document.activeElement.getAttribute("data-focus") : null;
  panel.replaceChildren();
  document.querySelectorAll("[data-step]").forEach((button) =>
    button.setAttribute("aria-pressed", String(+button.dataset.step === state.step)));
  element("tropical").disabled = !element("model").value.includes("TokenGT");
  element("advance").disabled = state.step === 3;
  if (state.step === 0) {
    table(panel, ["Direction", "Side", "Log bps", "Age (ms)"], frame.edges.map((edge) =>
      [edge.from + " → " + edge.to, edge.side, format(edge.bps), Math.round(edge.age).toLocaleString()]), "Observed quote edges");
    note(panel, "Log rates are expressed in a local currency-unit gauge. Cycle margins are invariant to this change of units.");
    if (frame.source) note(panel, frame.source + " · " + frame.bookCount + " / 3 observed books");
    return;
  }
  if (state.step === 1) {
    const row = (token) => [token.label, ...token.x.map((item) => format(item))];
    table(panel, ["Node", "Type", "Feature", "Coverage"], pipeline.tokens.nodes.map(row), "Node tokens");
    table(panel, ["Edge", "Type", "Feature", "Age ratio"], pipeline.tokens.edges.map(row), "Edge tokens");
    note(panel, "Each edge token keeps both endpoint IDs. Stale edge tokens are masked in computation.");
    return;
  }
  if (state.step === 2) {
    if (pipeline.stages.length > 1) {
      selectControl(panel, "Layer", pipeline.stages.map((stage) => stage.name), state.layer,
        (value) => { state.layer = value; state.query = 0; render(); });
      panel.querySelector("select").setAttribute("data-focus", "layer");
    }
    const stage = pipeline.stages[Math.min(state.layer, pipeline.stages.length - 1)];
    const query = stage.rows[Math.min(state.query, stage.rows.length - 1)];
    selectControl(panel, "Query", stage.rows.map((row) => row.label), state.query,
      (value) => { state.query = value; render(); });
    [...panel.querySelectorAll("select")].at(-1).setAttribute("data-focus", "query");
    const columns = ["Source", "Value", query.scores ? "Score" : "Message", "Weight"];
    table(panel, columns, query.sources.map((source, index) => [
      source, format(query.values[index]), format(query.scores?.[index]), format(query.weights[index]),
    ]), stage.name + " · " + format(query.output));
    note(panel, stage.description);
    const phase = stage.phases?.find((item) => item.label === query.label);
    if (phase) {
      table(panel, ["Basis", "|Amplitude|²"], phase.probabilities.map((p, index) => ["|" + index + "⟩", format(p)]), "Cyclic qutrit readout");
      note(panel, "Fourier-basis phase angle " + format(phase.angle) + " rad. Real clock expectation " + format(phase.expectation) + ".");
    }
    if (previousFocus) panel.querySelector('[data-focus="' + previousFocus + '"]')?.focus({preventScroll: true});
    return;
  }
  const output = pipeline.stages.at(-1);
  table(panel, ["Token or node", "Reference output"], output.rows.map((row) => [row.label, format(row.output)]), output.name);
  const best = result.best === -1 ? "Abstain" : result.scored[result.best].label;
  note(panel, "The independent route verifier selects " + best + " under the current quote-age and cost assumptions.");
}

function projectPoint(point, width, height, scale) {
  const [x, y, z] = point;
  const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
  const px = x * c - y * s, py = x * s + y * c;
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
  const screenY = py * cp - z * sp;
  const depth = py * sp + z * cp;
  const perspective = 4.9 / (4.9 - depth);
  return [width * 0.5 + px * perspective * scale, height * 0.52 + screenY * perspective * scale, depth];
}

function paintPath(points, color, width, closed = false) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  if (closed) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(point, radius, fill, border = null) {
  ctx.beginPath();
  ctx.arc(point[0], point[1], radius, 0, T);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function label(point, text, palette) {
  ctx.font = "16px Georgia";
  const width = ctx.measureText(text).width + 12;
  const x = point[0] + 10, y = point[1] - 19;
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(x, y - 14, width, 21);
  ctx.strokeStyle = palette.line;
  ctx.strokeRect(x, y - 14, width, 21);
  ctx.fillStyle = palette.text;
  ctx.fillText(text, x + 6, y + 1);
}

function arrow(from, to, color) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const scale = 8 / Math.max(1, Math.hypot(dx, dy));
  const x = dx * scale, y = dy * scale;
  paintPath([[to[0] - x + 0.6 * y, to[1] - y - 0.6 * x], to,
    [to[0] - x - 0.6 * y, to[1] - y + 0.6 * x]], color, 2);
}

function geometry(surface, u, v, offset = 0) {
  if (surface === "sphere") {
    const radius = 1.46 + offset;
    return [radius * Math.cos(v) * Math.cos(u), radius * Math.cos(v) * Math.sin(u), radius * Math.sin(v)];
  }
  const minor = 0.55 + offset;
  const major = 1.10 + minor * Math.cos(v);
  return [major * Math.cos(u), major * Math.sin(u), minor * Math.sin(v)];
}

function sampleCurve(fn, count) {
  return Array.from({length: count + 1}, (_, i) => fn(i / count));
}

function renderSurface(project, palette, frame, result, wallPhase) {
  const surface = element("surface").value;
  const isSphere = surface === "sphere";
  const vStart = isSphere ? -Math.PI / 2 : 0;
  const vSpan = isSphere ? Math.PI : T;
  const subdivisions = [44, 18];
  const mesh = [];
  const at = (u, v) => project(geometry(surface, u, v));
  for (let j = 0; j < subdivisions[1]; j += 1) {
    for (let i = 0; i < subdivisions[0]; i += 1) {
      const u = i * T / subdivisions[0], v = vStart + j * vSpan / subdivisions[1];
      const du = T / subdivisions[0], dv = vSpan / subdivisions[1];
      const quad = [at(u, v), at(u+du, v), at(u+du, v+dv), at(u, v+dv)];
      const depth = quad.reduce((sum, p) => sum + p[2], 0) / 4;
      const factor = Math.min(1, Math.max(0, (depth + 1.6) / 3.2));
      mesh.push({quad, depth, factor});
    }
  }
  const light = document.documentElement.dataset.theme === "light";
  mesh.sort((a, b) => a.depth - b.depth).forEach(({quad, factor}) => {
    ctx.beginPath();
    ctx.moveTo(quad[0][0], quad[0][1]);
    quad.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    const luminance = light ? 66 + 20 * factor : 10 + 11 * factor;
    ctx.fillStyle = "hsl(204 37% " + luminance + "%)";
    ctx.fill();
    ctx.strokeStyle = light ? "rgba(32,72,91,.32)" : "rgba(117,168,195,.32)";
    ctx.lineWidth = .7;
    ctx.stroke();
  });
  const offset = isSphere ? 0 : 0.86;
  const start = -2.58;
  const step = T / 3;
  const ring = (u, v = offset) => project(geometry(surface, u, v, 0.035));
  if (!isSphere) {
    ctx.setLineDash([4, 5]);
    paintPath(sampleCurve((t) => ring(start, offset + T*t), 42), palette.muted, 1.35);
    ctx.setLineDash([]);
    dot(ring(start, offset + Math.PI), 4, palette.canvas, palette.text);
  }
  const colors = [palette.copper, palette.jade];
  const activeAssets = frame.assets || PhaseWeave.currencies;
  for (let index = 0; index < 3; index += 1) {
    const a = start + index * step;
    colors.forEach((color, direction) => {
      const separation = (direction === 0 ? 1 : -1) * 0.045;
      const path = sampleCurve((t) => ring(a + t*step, offset + separation * Math.sin(t * Math.PI)), 32);
      const legs = result.scored[direction].legs;
      const base = activeAssets[index], counter = activeAssets[(index + 1) % 3];
      const edge = legs.find((leg) => leg?.from === (direction === 0 ? base : counter) &&
        leg?.to === (direction === 0 ? counter : base));
      ctx.globalAlpha = edge && edge.age <= +element("age").value ? 0.96 : 0.35;
      paintPath(path, color, result.best === direction ? 4.1 : 2.6);
      arrow(path[direction === 0 ? 16 : 23], path[direction === 0 ? 19 : 20], color);
      if (state.playback || live()) {
        const position = Math.floor((direction === 0 ? wallPhase : 1 - wallPhase) * 32);
        dot(path[position], 3.6, color);
      }
      ctx.globalAlpha = 1;
    });
    dot(ring(a + step/2), 4, palette.canvas, palette.text);
  }
  activeAssets.forEach((name, index) => {
    const p = ring(start + index * step);
    dot(p, 7.4, palette.text);
    label(p, name, palette);
  });
}

function networkPoints(column, points, project) {
  return points.map((_, index) => project([
    column, ((index % 5) - Math.min(2, (points.length - 1) / 2)) * 0.31,
    Math.floor(index / 5) * 0.34 - 0.14,
  ]));
}

function renderNetwork(project, palette, frame, pipeline) {
  const input = (frame.assets || PhaseWeave.currencies).map((name) => ({label: name}));
  const tokens = [...pipeline.tokens.nodes, ...pipeline.tokens.edges];
  const columns = [input, tokens, ...pipeline.stages.map((stage) => stage.rows),
    pipeline.stages.at(-1).rows.map((row) => ({label: row.label}))];
  const x = (index) => -1.64 + 3.28 * index / (columns.length - 1);
  const coordinates = columns.map((list, index) => networkPoints(x(index), list, project));
  const indexOfStage = state.step === 2 ? 2 + Math.min(state.layer, pipeline.stages.length-1) :
    state.step === 3 ? columns.length-1 : state.step;
  for (let layer = 1; layer < columns.length; layer += 1) {
    columns[layer].forEach((row, rowIndex) => {
      const prior = columns[layer - 1];
      const connections = prior.map((item, index) => ({item, index})).filter(({item}) =>
        row.sources ? row.sources.includes(item.label) :
          layer === 1 ? row.label.includes(item.label) : (row.label.includes(item.label) || item.label.includes(row.label)));
      connections.forEach(({index}) => {
        ctx.globalAlpha = layer === indexOfStage ? 0.86 : 0.22;
        paintPath([coordinates[layer - 1][index], coordinates[layer][rowIndex]], palette.line, 1.2);
      });
    });
  }
  ctx.globalAlpha = 1;
  const names = ["Input", "Tokens", ...pipeline.stages.map((stage) => stage.name), "Output"];
  columns.forEach((rows, layer) => {
    const active = layer === indexOfStage;
    const header = project([x(layer), -0.96, 0.07]);
    ctx.fillStyle = active ? palette.copper : palette.muted;
    ctx.font = "14px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(names[layer].replace("TokenGT attention", "Attention").replace("Max-plus Attention", "Max-plus"), header[0], header[1]);
    ctx.textAlign = "start";
    rows.forEach((row, index) => {
      const point = coordinates[layer][index];
      dot(point, active ? 6 : 3.5, row.active === false ? palette.line : active ? palette.copper : palette.jade);
      if (active && index === Math.min(state.query, rows.length - 1)) label(point, row.label, palette);
    });
  });
}

function draw(frame, pipeline, result, wallPhase = 0) {
  const {width, height} = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pxWidth = Math.round(width * dpr), pxHeight = Math.round(height * dpr);
  if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
    canvas.width = pxWidth;
    canvas.height = pxHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const css = getComputedStyle(document.documentElement);
  const palette = Object.fromEntries(["line", "text", "canvas", "muted", "copper", "jade"].map((key) =>
    [key, css.getPropertyValue("--" + key).trim()]));
  const factor = state.useNetwork ? Math.min(width * .235, height * .33) : Math.min(width * .22, height * .33);
  const project = (point) => projectPoint(point, width, height, factor);
  if (state.useNetwork) renderNetwork(project, palette, frame, pipeline);
  else renderSurface(project, palette, frame, result, wallPhase);
}

let current = null;
function drawCurrent(wallPhase = 0) {
  if (current) draw(current.frame, current.pipeline, current.result, wallPhase);
}

function render() {
  if (state.examples.length === 0) return;
  const age = +element("age").value, cost = +element("fee").value;
  const selection = state.examples.find((example) => example.id === element("example").value);
  const frame = live() ? feed.snapshot() : selection.frames[state.frame];
  const adjustedAge = frame.clockSkew ? -1 : age;
  const result = PhaseWeave.replay(frame, adjustedAge, cost);
  const pipeline = PhaseWeave.referencePipeline(frame, age, element("model").value, element("tropical").checked);
  current = { frame, pipeline, result };
  element("time").dateTime = frame.utc;
  element("time").textContent = "UTC " + frame.utc.slice(0, 19).replace("T", " ");
  element("timeline").value = String(state.frame);
  if (live()) {
    element("feed-state").textContent = frame.source + " · " + frame.bookCount + "/3 books" +
      (frame.clockSkew ? " · clock mismatch" : "");
  }
  const topology = PhaseWeave.cellulation(element("surface").value);
  element("topology").textContent = "V " + topology.vertices.length + " · E " + topology.edges.length +
    " · F " + topology.faces.length + " · genus " + topology.genus;
  const body = element("routes");
  body.replaceChildren();
  result.scored.concat([{ label: "Abstain", fresh: true, score: 0 }]).forEach((route, index) => {
    const row = body.insertRow();
    if (index === (result.best === -1 ? 2 : result.best)) row.setAttribute("aria-current", "true");
    addCell(row, "td", route.label, ["clockwise", "counter", ""][index]);
    addCell(row, "td", index === 2 ? "Available" : route.fresh ? "Fresh" : "Missing / stale");
    addCell(row, "td", format(route.score, 4));
  });
  inspector(frame, result, pipeline);
  drawCurrent((Date.now() % 1000) / 1000);
}

function setFrame(offset) {
  const last = +element("timeline").max;
  state.frame = Math.min(last, Math.max(0, state.frame + offset));
  render();
}

function stopPlayback() {
  clearInterval(state.playback);
  state.playback = null;
  element("play").textContent = "▶";
  element("play").setAttribute("aria-label", "Play replay");
}

function chooseExample() {
  stopPlayback();
  state.frame = 0;
  const isLive = live();
  const panel = document.querySelector(".playback");
  panel.classList.toggle("live", isLive);
  ["play", "previous", "next", "timeline"].forEach((id) => { element(id).hidden = isLive; });
  element("feed-state").hidden = !isLive;
  if (isLive) feed.start(); else feed.stop();
  render();
}

function theme(value) {
  document.documentElement.dataset.theme = value;
  element("dark").setAttribute("aria-pressed", String(value === "dark"));
  element("light").setAttribute("aria-pressed", String(value === "light"));
  try { localStorage.setItem("phaseweave-theme", value); } catch {}
  drawCurrent();
}

element("dark").addEventListener("click", () => theme("dark"));
element("light").addEventListener("click", () => theme("light"));
element("example").addEventListener("change", chooseExample);
["surface", "model", "age", "fee", "tropical"].forEach((id) => element(id).addEventListener("change", () => {
  state.layer = 0;
  state.query = 0;
  render();
}));
document.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
  state.step = +button.dataset.step;
  render();
}));
element("advance").addEventListener("click", () => {
  state.step = Math.min(3, state.step + 1);
  state.useNetwork = true;
  element("view").textContent = "Show surface";
  render();
});
element("timeline").addEventListener("input", (event) => {
  state.frame = +event.target.value;
  render();
});
element("previous").addEventListener("click", () => setFrame(-1));
element("next").addEventListener("click", () => setFrame(1));
element("play").addEventListener("click", () => {
  if (state.playback) { stopPlayback(); return; }
  if (state.frame === +element("timeline").max) state.frame = 0;
  element("play").textContent = "Ⅱ";
  element("play").setAttribute("aria-label", "Pause replay");
  state.playback = setInterval(() => {
    if (state.frame >= +element("timeline").max) stopPlayback();
    else setFrame(1);
  }, 650);
});
element("view").addEventListener("click", () => {
  state.useNetwork = !state.useNetwork;
  element("view").textContent = state.useNetwork ? "Show surface" : "Show network";
  drawCurrent();
});
element("reset").addEventListener("click", () => {
  state.yaw = -0.16;
  state.pitch = 0.64;
  drawCurrent();
});
canvas.addEventListener("pointerdown", (event) => {
  state.drag = [event.clientX, event.clientY];
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!state.drag) return;
  state.yaw += (event.clientX - state.drag[0]) * .012;
  state.pitch = Math.max(-1.12, Math.min(1.43, state.pitch + (event.clientY - state.drag[1]) * .011));
  state.drag = [event.clientX, event.clientY];
  drawCurrent();
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((name) =>
  canvas.addEventListener(name, () => { state.drag = null; }));
canvas.addEventListener("keydown", (event) => {
  const movement = {ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, -.1], ArrowDown: [0, .1]}[event.key];
  if (!movement) return;
  event.preventDefault();
  state.yaw += movement[0];
  state.pitch = Math.max(-1.12, Math.min(1.43, state.pitch + movement[1]));
  drawCurrent();
});
new ResizeObserver(() => drawCurrent()).observe(canvas);
setInterval(() => { if (live()) render(); }, 400);
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setInterval(() => { if (state.playback) drawCurrent((Date.now() % 1000) / 1000); }, 70);
}
window.addEventListener("pagehide", () => { feed.stop(); stopPlayback(); });
window.addEventListener("pageshow", (event) => { if (event.persisted && live()) chooseExample(); });
try {
  if (localStorage.getItem("phaseweave-theme") === "light") theme("light");
} catch {}

fetch("replay.json").then((response) => {
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}).then((examples) => {
  state.examples = examples;
  examples.forEach((example) => element("example").add(new Option(example.label, example.id)));
  element("example").add(new Option("Live · Gate spot", liveId));
  chooseExample();
}).catch(() => { element("status").textContent = "The archived examples could not load. Serve the site over HTTP and reload."; });

const referenceProviders = [
  {
    name: "ECB reference rates",
    url: "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY+GBP.EUR.SP00.A?lastNObservations=1&format=csvdata",
    parse: async (response) => (await response.text()).trim().split(/\\r?\\n/).slice(1).map((line) => {
      const fields = line.split(",");
      return ["EUR / " + fields[2], fields[6], fields[7]];
    }),
  },
  {
    name: "U.S. Treasury average interest rates",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date,src_line_nbr&page%5Bsize%5D=6",
    parse: async (response) => (await response.json()).data.map((row) =>
      [row.security_desc, row.record_date, row.avg_interest_rate_amt + "%"]),
  },
];

element("reference").addEventListener("click", async () => {
  const output = element("reference-values");
  output.replaceChildren();
  note(output, "Fetching official observations…");
  element("reference").disabled = true;
  const results = await Promise.allSettled(referenceProviders.map(async (provider) => {
    const response = await fetch(provider.url, {signal: AbortSignal.timeout(9000)});
    if (!response.ok) throw new Error("HTTP " + response.status);
    return provider.parse(response);
  }));
  output.replaceChildren();
  results.forEach((result, index) => {
    const provider = referenceProviders[index];
    if (result.status === "fulfilled") table(output, ["Series", "Observation date", "Reference value"], result.value, provider.name);
    else note(output, provider.name + " · currently unavailable.");
  });
  note(output, "Reference series are excluded from quote-cycle scores.");
  element("reference").disabled = false;
});
