"use strict";

const DensityWalk = (() => {
  const order = [[0, 1], [1, 2], [2, 0]];
  const fxAssets = ["EUR", "USD", "JPY"];
  const dimensions = [0, 1, 2];
  const zero = () => [0, 0];
  const add = ([a, b], [c, d]) => [a + c, b + d];
  const multiply = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const conjugate = ([a, b]) => [a, -b];
  const squared = ([a, b]) => a * a + b * b;
  const phase = (angle) => [Math.cos(angle), Math.sin(angle)];
  const inner = (left, right) => left.reduce((sum, value, index) => add(sum, multiply(value, right[index])), zero());
  const adjoint = (matrix) => dimensions.map((i) => dimensions.map((j) => conjugate(matrix[j][i])));
  const act = (matrix, vector) => matrix.map((row) => inner(row, vector));
  const compose = (left, right) => left.map((row) => dimensions.map((j) => inner(row, right.map((column) => column[j]))));
  const total = (values) => values.reduce((sum, value) => sum + value, 0);
  const density = (state) => state.map((site) => total(site.map(squared)));
  const trace = (matrix) => dimensions.reduce((sum, i) => add(sum, matrix[i][i]), zero());
  const diagonal = (values) => dimensions.map((i) => dimensions.map((j) => i === j ? values[i] : zero()));

  function linkUnitary(angle) {
    const phases = [phase(angle), phase(-angle / 2), phase(-angle / 2)];
    // The three-cycle is an even permutation, so D(angle)C has determinant one.
    return dimensions.map((i) => dimensions.map((j) => i === (j + 1) % 3 ? phases[i] : zero()));
  }

  function rotation(first, second, angle) {
    const unitary = diagonal(dimensions.map(() => [1, 0]));
    unitary[first][first] = [Math.cos(angle), 0];
    unitary[second][second] = [Math.cos(angle), 0];
    unitary[first][second] = [-Math.sin(angle), 0];
    unitary[second][first] = [Math.sin(angle), 0];
    return unitary;
  }

  const localBasis = [rotation(0, 1, .64), rotation(1, 2, -.92), rotation(0, 2, .56)];

  function changeBasis(state, links, basis = localBasis) {
    return {
      state: state.map((site, i) => act(basis[i], site)),
      links: links.map((link) => ({ ...link, unitary: link.unitary &&
        compose(compose(basis[link.target], link.unitary), adjoint(basis[link.source])) })),
    };
  }

  function marketLinks(frame, options) {
    const assets = frame.assets || fxAssets;
    const byPair = new Map((frame.edges || []).map((edge) => [edge.from + "/" + edge.to, edge]));
    return order.map(([source, target]) => {
      const forward = byPair.get(assets[source] + "/" + assets[target]);
      const reverse = byPair.get(assets[target] + "/" + assets[source]);
      const rate = forward && reverse && Number.isFinite(forward.bps) && Number.isFinite(reverse.bps)
        ? (forward.bps - reverse.bps) / 2 : null;
      const age = forward && reverse && Number.isFinite(forward.age) && Number.isFinite(reverse.age)
        ? Math.max(forward.age, reverse.age) : null;
      const active = !frame.clockSkew && rate !== null && age !== null && age >= 0 && age <= options.ageLimit;
      return { source, target, rate, age, active,
        mixing: active ? options.mix * Math.exp(-age / options.ageLimit) : 0,
        unitary: active ? linkUnitary(options.phase * Math.tanh(rate / 2)) : null,
      };
    });
  }

  function initialState(site) {
    return dimensions.map((i) => i === site
      ? [[Math.sqrt(.6), 0], [0, Math.sqrt(.3)], [Math.sqrt(.1), 0]]
      : dimensions.map(zero));
  }

  function sweep(state, links) {
    const next = [...state];
    const flux = links.map(({ source, target, active, unitary, mixing }) => {
      if (!active) return 0;
      const a = next[source];
      const b = next[target];
      const toA = act(adjoint(unitary), b);
      const toB = act(unitary, a);
      const c = [Math.cos(mixing), 0];
      const s = [Math.sin(mixing), 0];
      const minusS = [-s[0], 0];
      next[source] = a.map((value, i) => add(multiply(c, value), multiply(minusS, toA[i])));
      next[target] = b.map((value, i) => add(multiply(c, value), multiply(s, toB[i])));
      return total(next[target].map(squared)) - total(b.map(squared));
    });
    return { state: next, flux };
  }

  function wilson(links) {
    if (!links.every((link) => link.active)) return null;
    const [ab, bc, ca] = links.map((link) => link.unitary);
    return trace(compose(ca, compose(bc, ab))).map((part) => part / 3);
  }

  function start(frame, site, options) {
    return { state: initialState(site), frame, links: marketLinks(frame, options), flux: [0, 0, 0], index: 0 };
  }

  function next(step, frame, options) {
    const links = marketLinks(frame, options);
    return { ...sweep(step.state, links), frame, links, index: step.index + 1 };
  }

  function replay(frames, site, options) {
    const steps = [start(frames[0], site, options)];
    for (const frame of frames.slice(1)) steps.push(next(steps.at(-1), frame, options));
    return steps;
  }

  return { fxAssets, initialState, density, squared, total, adjoint, compose, act, linkUnitary, changeBasis,
    marketLinks, sweep, wilson, start, next, replay };
})();

if (typeof module !== "undefined") module.exports = DensityWalk;

if (typeof document !== "undefined") {
  const get = (id) => document.getElementById(id);
  const escape = (value) => String(value).replace(/[&<>"']/g, (letter) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[letter]);
  const signed = (value, digits = 4) => (value < 0 ? "−" : "+") + Math.abs(value).toFixed(digits);
  const magnitude = (vector) => Math.hypot(...vector);
  const positions = [[260, 76], [103, 279], [417, 279]];
  const liveSources = { "gate-eth": ["ETH", "BTC", "USDT"], "gate-xrp": ["XRP", "BTC", "USDT"] };
  const state = { examples: [], steps: [], index: 0, feed: null, timer: null, observe: null };

  const paintCloud = DensityCloud.build(get("cloud-view"));
  const cloud = { fraction: 1, previous: null, current: null, names: [], legendValues: [], animation: 0 };
  function cancelCloud() { cancelAnimationFrame(cloud.animation); cloud.animation = 0; }
  function updateCloud() {
    if (!cloud.current) return;
    const mode = get("cloud-mode").value;
    const angle = Number(get("cloud-angle").value);
    const rows = DensityCloud.blend(cloud.previous, cloud.current, cloud.fraction);
    const totals = rows.map(row => DensityWalk.total(row));
    const step = state.steps[state.index];
    const residual = state.index ? DensityCloud.continuity(cloud.previous, rows, step.links, step.flux, cloud.fraction) : 0;
    const isolated = mode.startsWith("component-") ? Number(mode.slice(-1)) : null;
    const mass = isolated === null ? DensityWalk.total(totals) : DensityWalk.total(rows.map(row=>row[isolated]));
    for (const {index, value} of cloud.legendValues) {
      const amount=mode==="site"?totals[index]:DensityWalk.total(rows.map(row=>row[index]));
      value.textContent=(100*amount).toFixed(1)+"%";
    }
    get("cloud-mass").textContent = mass.toFixed(8);
    get("cloud-continuity").textContent = residual.toExponential(2);
    get("cloud-angle-label").textContent = angle + "°";
    get("cloud-blend").disabled = state.index === 0;
    get("cloud-blend").value = Math.round(100*cloud.fraction);
    get("cloud-blend-label").textContent = Math.round(100*cloud.fraction) + "%";
    get("cloud-step").textContent = state.index ? "Step " + state.steps[state.index-1].index + " → " + step.index : (step.index === 0 ? "Initial state · step 0" : "Oldest retained step " + step.index);
    paintCloud(rows, cloud.names, mode, angle, document.documentElement.dataset.theme === "light");
  }
  function cloudLegend() {
    const site = get("cloud-mode").value === "site";
    const isolated = get("cloud-mode").value.startsWith("component-") ? Number(get("cloud-mode").value.slice(-1)) : null;
    const colors = site ? [["#4debcb","#006c5d"],["#ffab64","#ae430d"],["#b79afc","#5e36a0"]]
      : [["#60ceff","#045b8f"],["#ffb370","#994b09"],["#d98cff","#813691"]];
    cloud.legendValues=[];
    const keys = (site ? cloud.names : ["|0⟩","|1⟩","|2⟩"]).flatMap((name,i) => {
      if (isolated !== null && i !== isolated) return [];
      const span=document.createElement("span"), dot=document.createElement("i");
      span.className="cloud-key";dot.setAttribute("aria-hidden","true");
      dot.style.setProperty("--key-dark",colors[i][0]);dot.style.setProperty("--key-light",colors[i][1]);
      const value=document.createElement("span");cloud.legendValues.push({index:i,value});
      span.append(dot,name,value);return [span];
    });
    get("cloud-legend").replaceChildren(...keys);
  }
  function showCloud(previous, current, names) {
    cancelCloud();
    cloud.previous = previous.map(site => site.map(DensityWalk.squared));
    cloud.current = current.map(site => site.map(DensityWalk.squared));
    cloud.names = names;
    cloud.fraction = 1;
    cloudLegend();
    updateCloud();
  }
  function animateCloud() {
    if (!state.index || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const tick = now => {
      cloud.fraction = Math.min(1,Math.max(0,(now-start)/520));
      updateCloud();
      if (cloud.fraction < 1) cloud.animation=requestAnimationFrame(tick);
    };
    tick(start);
  }
  get("cloud-mode").addEventListener("change",()=>{cloudLegend();updateCloud();});
  get("cloud-angle").addEventListener("input",updateCloud);
  get("cloud-blend").addEventListener("input",()=>{
    stop();cloud.fraction=Number(get("cloud-blend").value)/100;updateCloud();
  });
  window.addEventListener("resize",updateCloud);

  function settings() {
    return { mix: +get("mix").value, phase: +get("phase").value, ageLimit: +get("quote-age").value };
  }

  function status(text) {
    if (get("walk-status").textContent !== text) get("walk-status").textContent = text;
  }

  function table(parent, rows) {
    const body = document.getElementById(parent);
    body.replaceChildren(...rows.map(([label, ...values]) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = label;
      row.append(name);
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
  }

  function renderMap(assets, densities, step) {
    const links = step.links.map(({ source, target, active }, i) => {
      const positive = step.flux[i] >= 0;
      const [startX, startY] = positions[positive ? source : target];
      const [endX, endY] = positions[positive ? target : source];
      const length = Math.hypot(endX - startX, endY - startY);
      const dx = (endX - startX) / length;
      const dy = (endY - startY) / length;
      const tipX = endX - 44 * dx;
      const tipY = endY - 44 * dy;
      const path = `M ${startX + 43 * dx} ${startY + 43 * dy} L ${tipX} ${tipY}`;
      const flux = Math.abs(step.flux[i]);
      if (!active || flux < 1e-10) {
        return `<path class="map-flux ${active ? "map-boundary" : "map-inactive"}" d="${path}"/>`;
      }
      const tailX = tipX - 10 * dx;
      const tailY = tipY - 10 * dy;
      return `<g class="${positive ? "map-forward" : "map-reverse"}">
        <path class="map-flux" d="${path}" stroke-width="${1.5 + 6 * Math.sqrt(flux)}"/>
        <path class="map-arrow" d="M ${tipX} ${tipY} L ${tailX - 5 * dy} ${tailY + 5 * dx} L ${tailX + 5 * dy} ${tailY - 5 * dx}Z"/>
      </g>`;
    });
    const nodes = assets.map((asset, i) => {
      const [x, y] = positions[i];
      const probability = Math.max(0, densities[i]);
      return `<g><circle class="map-node" cx="${x}" cy="${y}" r="39"/>
        <circle class="map-prob" cx="${x}" cy="${y}" r="${34 * Math.sqrt(probability)}"/>
        <text class="map-text" x="${x}" y="${y + 6}">${escape(asset)}</text>
        <text class="map-detail" x="${x}" y="${y + 60}">${(100 * probability).toFixed(1)}%</text></g>`;
    });
    get("walk-map").innerHTML = links.join("") + nodes.join("");
  }

  function drawTrace(assets) {
    const samples = state.steps.map((step) => DensityWalk.density(step.state));
    const x = (i) => 52 + 570 * i / Math.max(1, samples.length - 1);
    const y = (value) => 142 - 118 * value;
    const grid = [0, .5, 1].map((value) => `<line class="trace-grid" x1="52" x2="622" y1="${y(value)}" y2="${y(value)}"/>
      <text class="trace-label" x="1" y="${y(value) + 4}">${Math.round(100 * value)}%</text>`);
    const traces = assets.map((asset, index) => {
      const coordinates = samples.map((row, i) => `${x(i)},${y(row[index])}`).join(" ");
      return `<polyline class="trace-line trace-${index}" points="${coordinates}"/>
        <circle class="trace-point trace-${index}" r="4.25" cx="${x(state.index)}" cy="${y(samples[state.index][index])}"/>`;
    });
    get("density-trace").innerHTML = grid.join("") + `<line class="trace-selected" x1="${x(state.index)}" x2="${x(state.index)}" y1="19" y2="147"/>`
      + traces.join("") + `<text class="trace-label" x="52" y="164">Step ${state.steps[0].index}</text>
      <text class="trace-label" text-anchor="end" x="622" y="164">${state.steps.at(-1).index}</text>`;
    get("trace-readout").textContent = assets.map((asset, i) => `${asset} ${(100 * samples[state.index][i]).toFixed(1)}%`).join(" · ");
  }

  function render() {
    const step = state.steps[state.index];
    if (!step) return;
    const assets = step.frame.assets || DensityWalk.fxAssets;
    const rotated = get("color-basis").value === "rotated";
    const basis = DensityWalk.changeBasis(step.state, step.links);
    const view = rotated ? basis : step;
    const densities = DensityWalk.density(view.state);
    const total = DensityWalk.total(densities);
    const trace = DensityWalk.wilson(view.links);
    get("total-probability").textContent = total.toFixed(10);
    get("norm-error").textContent = Math.abs(total - 1).toExponential(2);
    get("wilson-trace").textContent = trace ? `${trace[0].toFixed(6)} ${signed(trace[1], 6)}i` : "Unavailable · open triangle";
    if (rotated) {
      const compare = DensityWalk.wilson(step.links);
      const delta = Math.max(...DensityWalk.density(step.state).map((value, i) => Math.abs(value - densities[i])));
      const traceDelta = compare ? magnitude(compare.map((value, i) => value - trace[i])).toExponential(1) : "unavailable";
      get("gauge-audit").textContent = `Basis check · max site density Δ ${delta.toExponential(1)} · Wilson trace Δ ${traceDelta}`;
    } else get("gauge-audit").textContent = "The three component populations depend on the local basis.";
    table("populations", view.state.map((site, i) => [assets[i], densities[i].toFixed(4), ...site.map((component) => DensityWalk.squared(component).toFixed(4))]));
    table("fluxes", step.links.map((link, i) => [assets[link.source] + " → " + assets[link.target],
      link.rate === null ? "—" : signed(link.rate, 3), link.age === null ? "—" : Math.round(link.age),
      link.active ? signed(step.flux[i]) : "closed"]));
    get("walk-index").textContent = `Step ${step.index}`;
    const time = new Date(step.frame.utc);
    get("quote-time").textContent = Number.isFinite(+time) ? `${time.toISOString().slice(0, 19).replace("T", " ")} UTC` : "Awaiting quotes";
    get("walk-timeline").value = state.index;
    const previous = state.steps[Math.max(0,state.index-1)];
    const oldState = rotated ? DensityWalk.changeBasis(previous.state,previous.links).state : previous.state;
    showCloud(oldState,view.state,assets);
    renderMap(assets, densities, step);
    drawTrace(assets);
  }

  function updateControls() {
    const end = state.index >= state.steps.length - 1;
    get("walk-timeline").max = Math.max(0, state.steps.length - 1);
    get("walk-timeline").disabled = state.steps.length < 2;
    get("walk-step").disabled = state.feed ? !currentLiveFrame() && end : end;
    get("walk-play").disabled = !state.steps.length;
    get("walk-reset").disabled = !state.steps.length;
  }

  function currentLiveFrame() {
    if (!state.feed) return null;
    const frame = state.feed.snapshot();
    return frame.bookCount === 3 && !frame.clockSkew && DensityWalk.marketLinks(frame, settings()).some((link) => link.active)
      ? frame : null;
  }

  function stop() {
    cancelCloud();
    clearInterval(state.timer);
    state.timer = null;
    get("walk-play").setAttribute("aria-pressed", "false");
    get("walk-play").textContent = "Play walk";
  }

  function rebuild({ preserve = false } = {}) {
    if (!get("quote-source").value) return;
    const options = settings();
    get("mix-label").textContent = `${options.mix.toFixed(2)} rad`;
    get("phase-label").textContent = options.phase.toFixed(2);
    const site = +get("initial-site").value;
    if (state.feed) {
      const frame = currentLiveFrame() || { assets: state.feed.assets, edges: [] };
      state.steps = [DensityWalk.start(frame, site, options)];
      state.index = 0;
    } else {
      const replay = state.examples.find((sample) => sample.id === get("quote-source").value);
      state.steps = DensityWalk.replay(replay.frames, site, options);
      state.index = preserve ? Math.min(state.index, state.steps.length - 1) : 0;
      status("HistData.com · historical FX replay");
    }
    updateControls();
    render();
  }

  function selectSource() {
    stop();
    state.feed?.stop();
    clearInterval(state.observe);
    const liveAssets = liveSources[get("quote-source").value];
    state.feed = null;
    const replay = state.examples.find((sample) => sample.id === get("quote-source").value);
    const assets = liveAssets || replay.frames[0].assets || DensityWalk.fxAssets;
    get("initial-site").replaceChildren(...assets.map((asset, i) => new Option(asset, i)));
    if (liveAssets) {
      get("quote-age").value = "5000";
      state.feed = new GatePublicFeed(() => {}, liveAssets);
      state.feed.start();
      const refreshStatus = () => {
        const live = currentLiveFrame();
        status(live ? `${live.source} · step uses the current quote snapshot`
          : `${state.feed.mode} · waiting for fresh books`);
        updateControls();
      };
      refreshStatus();
      state.observe = setInterval(refreshStatus, 350);
    } else get("quote-age").value = "250";
    rebuild();
  }

  function advance() {
    if (state.index < state.steps.length - 1) state.index += 1;
    else if (state.feed) {
      const frame = currentLiveFrame();
      if (!frame) return;
      const previous = state.steps.at(-1);
      state.steps.push(DensityWalk.next(previous, frame, settings()));
      if (state.steps.length > 96) state.steps.shift();
      state.index = state.steps.length - 1;
    } else { stop(); return; }
    updateControls();
    render();
    animateCloud();
  }

  function theme(value) {
    document.documentElement.dataset.theme = value;
    updateCloud();
    get("dark").setAttribute("aria-pressed", String(value === "dark"));
    get("light").setAttribute("aria-pressed", String(value === "light"));
    try { localStorage.setItem("phaseweave-theme", value); } catch {}
  }

  get("dark").addEventListener("click", () => theme("dark"));
  get("light").addEventListener("click", () => theme("light"));
  try { if (localStorage.getItem("phaseweave-theme") === "light") theme("light"); } catch {}
  get("quote-source").addEventListener("change", selectSource);
  get("initial-site").addEventListener("change", () => { stop(); rebuild(); });
  get("color-basis").addEventListener("change", render);
  for (const id of ["mix", "phase", "quote-age"]) {
    get(id).addEventListener("input", () => { stop(); rebuild({ preserve: true }); });
  }
  get("walk-timeline").addEventListener("input", () => { stop(); state.index = +get("walk-timeline").value; updateControls(); render(); });
  get("walk-step").addEventListener("click", () => { stop(); advance(); });
  get("walk-reset").addEventListener("click", () => { stop(); rebuild(); });
  get("walk-play").addEventListener("click", () => {
    if (state.timer) { stop(); return; }
    if (!state.feed && state.index === state.steps.length - 1) state.index = 0;
    get("walk-play").setAttribute("aria-pressed", "true");
    get("walk-play").textContent = "Pause walk";
    advance();
    state.timer = setInterval(advance, 680);
  });
  window.addEventListener("pagehide", () => { stop(); clearInterval(state.observe); state.feed?.stop(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted && state.feed) selectSource(); });

  fetch("replay.json").then((response) => {
    if (!response.ok) throw new Error("Could not load quote examples");
    return response.json();
  }).then((examples) => {
    state.examples = examples.filter((example) => Array.isArray(example.frames) && example.frames.length > 1);
    if (!state.examples.length) throw new Error("No quote examples");
  }).catch(() => { status("The historical quote examples are unavailable."); }).finally(() => {
    const quoteSource = get("quote-source");
    quoteSource.replaceChildren(...state.examples.map((example) => new Option(example.label, example.id)),
      ...Object.entries(liveSources).map(([id, assets]) => new Option(`Live · ${assets.join(" / ")}`, id)));
    // Connecting to Gate requires selecting a live example, even if archives fail to load.
    if (!state.examples.length) {
      const placeholder = new Option("Select a live source", "", true, true);
      placeholder.disabled = true;
      quoteSource.prepend(placeholder);
    }
    quoteSource.disabled = false;
    get("initial-site").disabled = false;
    if (state.examples.length) selectSource();
  });
}
