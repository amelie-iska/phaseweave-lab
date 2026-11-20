"use strict";

(() => {
  const $ = (id) => document.getElementById("latent-" + id);
  const math = LatentReasoning;
  const qs = new URLSearchParams(location.search);
  const views = {
    forest: ["Forest of Thought", "Candidate trajectories",
      "Grow three continuous paths from the observed state. At step three each path forks. Compare their terminal scores under the same reward field."],
    analogy: ["Analogical transfer", "Transport an observed displacement",
      "Retrieve an earlier episode by the distance between its starting point and the current embedding. Carry its observed displacement to the selected market frame."],
    steering: ["Concept basis steering", "Intervene along two directions",
      "Move the same market representation along one or both fitted directions. The chart and table report the resulting coordinates and direction coefficients."],
    flow: ["Continuous GFlowNet", "Reward density and sampled trajectories",
      "Sample an intermediate embedding and then a terminal embedding. Moving the reward weight changes the normalized terminal density and the paths drawn from it."],
  };
  const view = qs.get("mode");
  const state = {
    mode: Object.hasOwn(views, view) ? view : "forest",
    examples: [], example: 0, frame: 0, depth: 5, fork: 1, source: -1,
    strength: 1, skew: 0.45, friction: -0.6, mass: 1.85, count: 28, seed: 56, timer: null,
  };
  const asCoordinate = (vector) => "(" + vector.map((value) => value.toFixed(3)).join(", ") + ")";
  const utc = (value) => value.replace("T", " ").replace("+00:00", " UTC");
  const stamp = (frame) => Date.parse(frame.utc);
  const colors = () => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(["canvas", "faint", "line", "muted", "text", "jade", "copper"]
      .map((name) => [name, styles.getPropertyValue("--" + name).trim()]));
  };

  function cell(row, name, text) {
    const node = document.createElement(name);
    node.textContent = text;
    row.append(node);
    return node;
  }

  function table(title, headings, values) {
    const output = document.createElement("table");
    output.setAttribute("aria-label", title);
    const header = output.createTHead().insertRow();
    headings.forEach((text) => cell(header, "th", text).scope = "col");
    const body = output.createTBody();
    values.forEach((list) => {
      const row = body.insertRow();
      list.forEach((text) => cell(row, "td", text));
    });
    return output;
  }

  function textBlock(text, className) {
    const node = document.createElement("p");
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function slider(key, label, min, max, step, digits = 2) {
    const wrapper = document.createElement("label");
    const value = document.createElement("output");
    value.setAttribute("for", "latent-setting-" + key);
    const input = document.createElement("input");
    Object.assign(input, {type: "range", id: "latent-setting-" + key, min, max, step, value: state[key]});
    const update = () => { value.textContent = state[key].toFixed(digits); };
    input.addEventListener("input", () => {
      state[key] = Number(input.value);
      update();
      render();
    });
    update();
    wrapper.append(label, value, input);
    return wrapper;
  }

  function command(label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", callback);
    return button;
  }

  function selectAnalysisSource(target) {
    return state.examples.map((episode, index) => ({
      episode, index,
      distance: math.norm(math.sub(target.point, episode.states[0].point)),
    })).filter(({episode, index}) => index !== state.example &&
      stamp(episode.frames.at(-1)) < stamp(state.examples[state.example].frames[state.frame]))
      .sort((a, b) => a.distance - b.distance);
  }

  function paintControls() {
    const panel = $("controls");
    panel.replaceChildren();
    if (state.mode === "forest") {
      panel.append(slider("depth", "Reasoning steps", 0, 7, 1, 0), slider("fork", "Branch diversification", 0, 2, 0.05));
      panel.append(command("Play trajectory steps", () => {
        if (state.timer) clearInterval(state.timer);
        state.depth = 0;
        paintControls();
        render();
        state.timer = setInterval(() => {
          state.depth++;
          render();
          const control = document.getElementById("latent-setting-depth");
          control.value = String(state.depth);
          control.closest("label").querySelector("output").textContent = String(state.depth);
          if (state.depth >= 7) {
            clearInterval(state.timer);
            state.timer = null;
          }
        }, 340);
      }));
    } else if (state.mode === "analogy") {
      const query = state.examples[state.example].states[state.frame];
      const neighbors = selectAnalysisSource(query);
      if (!neighbors.length) return;
      const label = document.createElement("label");
      label.append("Earlier episode");
      const select = document.createElement("select");
      select.append(new Option("Nearest eligible episode", "-1"));
      neighbors.forEach(({episode, index}) => select.append(new Option(episode.label, index)));
      select.value = neighbors.some(({index}) => index === state.source) ? String(state.source) : "-1";
      select.addEventListener("change", () => { state.source = Number(select.value); render(); });
      label.append(select);
      panel.append(label, slider("strength", "Transfer strength λ", 0, 1.75, 0.05));
    } else if (state.mode === "steering") {
      panel.append(slider("skew", "Loop imbalance α", -1.6, 1.6, 0.05),
        slider("friction", "Spread direction β", -1.6, 1.6, 0.05));
      panel.append(command("Reset intervention", () => {
        state.skew = 0;
        state.friction = 0;
        paintControls();
        render();
        panel.querySelector("button").focus();
      }));
    } else {
      panel.append(slider("mass", "Selected episode reward mass", 0.2, 4, 0.05),
        slider("count", "Sampled trajectories", 8, 76, 4, 0));
      panel.append(command("Draw another sample", () => { state.seed++; render(); }));
    }
  }

  function scene(current, components) {
    const panel = $("readout");
    panel.replaceChildren();
    panel.append(textBlock("Observed embedding  " + asCoordinate(current.point), "latent-metrics"));
    const layers = {points: [], lines: [], field: false};
    if (state.mode === "forest") {
      const paths = math.forest(current.point, components, state.fork, state.depth);
      const best = paths.reduce((a, b) => b.reward > a.reward ? b : a);
      paths.forEach((path) => {
        const highlight = path === best;
        layers.lines.push({coords: path.points, color: highlight ? "copper" : "jade", width: highlight ? 3 : 1.7, alpha: highlight ? 1 : 0.7});
        path.points.slice(1).forEach((point) => layers.points.push({point, color: highlight ? "copper" : "jade", radius: 3}));
      });
      panel.append(table("Continuous FoT path scores", ["Destination context", "R(z)"], paths.map((path) =>
        [state.examples[path.index].label.replace("FX · ", "") +
          (path.branch ? (path.branch < 0 ? " · A" : " · B") : "") +
          (path === best && state.depth > 0 ? "  ✓" : ""), path.reward.toFixed(4)])));
      panel.append(textBlock(state.depth > 0 ? "Highest-score endpoint  " + asCoordinate(best.points.at(-1))
        : "All paths start from the same observed state.", "latent-metrics"));
    } else if (state.mode === "analogy") {
      const candidates = selectAnalysisSource(current);
      const found = candidates.find(({index}) => index === state.source) ?? candidates[0];
      if (!found) {
        panel.append(textBlock("No earlier recorded episode is available for this frame. Select the September or London episode to see a time-eligible transfer."));
        return layers;
      }
      const {episode, distance} = found;
      const before = episode.states[0].point;
      const after = episode.states.at(-1).point;
      const {displacement, prediction} = math.analogy(current.point, before, after, state.strength);
      layers.lines.push({coords: [before, after], color: "jade", width: 2, arrow: true, dash: [5, 4]},
        {coords: [current.point, prediction], color: "copper", width: 2.8, arrow: true});
      layers.points.push({point: before, color: "jade", radius: 4}, {point: prediction, color: "copper", radius: 5});
      panel.append(table("Analogy source and transformed query", ["Step", "Value"], [
        ["Earlier source", episode.label], ["Earlier start", utc(episode.frames[0].utc)],
        ["Earlier end", utc(episode.frames.at(-1).utc)], ["Start distance", distance.toFixed(3)],
        ["Source displacement Δ", asCoordinate(displacement)], ["Transferred embedding", asCoordinate(prediction)],
      ]));
    } else if (state.mode === "steering") {
      const [skew, friction] = state.basis;
      const first = math.add(current.point, math.scale(skew, state.skew));
      const next = math.add(first, math.scale(friction, state.friction));
      layers.lines.push({coords: [current.point, first], color: "jade", width: 2.6, arrow: true},
        {coords: [first, next], color: "copper", width: 2.6, arrow: true, dash: [6, 4]});
      layers.points.push({point: next, color: "copper", radius: 6});
      panel.append(table("Steering directions and result", ["Quantity", "Coordinates"], [
        ["Loop imbalance basis v₁", asCoordinate(skew)], ["Orthogonal spread basis v₂", asCoordinate(friction)],
        ["Basis inner product", Math.abs(math.dot(skew, friction)).toExponential(1)], ["Steered embedding", asCoordinate(next)],
      ]));
    } else {
      const kernel = math.bridge(current.point, components);
      const random = math.rng(state.seed + state.frame * 23 + state.example * 541);
      const counts = components.map(() => 0);
      let max = 0;
      for (let i = 0; i < state.count; i++) {
        const drawing = kernel.sample(random);
        counts[drawing.component]++;
        max = Math.max(max, Math.abs(drawing.residual));
        layers.lines.push({coords: [current.point, drawing.z, drawing.x], color: "jade", width: 0.8, alpha: 0.31});
        layers.points.push({point: drawing.x, color: "copper", radius: 2.5});
      }
      layers.field = true;
      panel.append(table("Continuous reward mixture", ["Reward component", "Mass share", "Drawn"], components.map((component, i) =>
        [state.examples[i].label.replace("FX · ", ""), (100 * component.mass / kernel.total).toFixed(1) + "%", String(counts[i])])));
      panel.append(textBlock("Z = " + kernel.total.toFixed(3) + " · max |balance residual| = " + max.toExponential(1), "latent-metrics"));
    }
    return layers;
  }

  function renderChart(layers, current, components) {
    const canvas = $("chart");
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (width < 10 || height < 10) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) {
      $("error").textContent = "Canvas is unavailable. The observed input and method values remain in the tables.";
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const palette = colors();
    const points = [...layers.points.map((item) => item.point), current.point];
    const range = Math.max(2.8, ...points.map((point) => Math.max(Math.abs(point[0]), Math.abs(point[1])) + 0.2));
    const box = {x: 54, y: 14, w: width - 72, h: height - 57};
    const map = ([x, y]) => [box.x + (x + range) / (2 * range) * box.w,
      box.y + (range - y) / (2 * range) * box.h];

    if (layers.field) {
      const step = 7, max = Math.max(...components.map((part) => math.reward(part.center, components)));
      context.fillStyle = palette.jade;
      for (let px = 0; px < box.w; px += step) {
        for (let py = 0; py < box.h; py += step) {
          const value = [(px + step / 2) / box.w * 2 * range - range, range - (py + step / 2) / box.h * 2 * range];
          context.globalAlpha = Math.min(0.46, Math.sqrt(math.reward(value, components) / max) * 0.46);
          context.fillRect(box.x + px, box.y + py, Math.min(step, box.w - px), Math.min(step, box.h - py));
        }
      }
      context.globalAlpha = 1;
    }
    const axis = Math.floor(range);
    context.font = "10px ui-monospace, monospace";
    context.fillStyle = palette.muted;
    for (let tick = -axis; tick <= axis; tick++) {
      const [x, y] = map([tick, tick]);
      context.strokeStyle = tick === 0 ? palette.line : palette.faint;
      context.beginPath();
      context.moveTo(x, box.y);
      context.lineTo(x, box.y + box.h);
      context.moveTo(box.x, y);
      context.lineTo(box.x + box.w, y);
      context.stroke();
      context.textAlign = "center";
      context.fillText(String(tick), x, box.y + box.h + 13);
      context.textAlign = "right";
      context.fillText(String(tick), box.x - 6, y + 3);
    }
    context.textAlign = "center";
    context.fillText("Cycle imbalance  z₁", box.x + box.w / 2, height - 9);
    context.save();
    context.translate(14, box.y + box.h / 2);
    context.rotate(-Math.PI / 2);
    context.fillText("Quote friction  z₂", 0, 0);
    context.restore();

    function mark(point, size, color, square = false) {
      const [x, y] = map(point);
      context.fillStyle = palette[color];
      if (square) context.fillRect(x - size, y - size, size * 2, size * 2);
      else {
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 0.48;
    state.examples.forEach((episode) => episode.states.forEach(({point}) => mark(point, 2, "muted")));
    context.globalAlpha = 1;

    layers.lines.forEach((line) => {
      const coordinates = line.coords.map(map);
      context.lineWidth = line.width;
      context.globalAlpha = line.alpha ?? 1;
      context.strokeStyle = palette[line.color];
      context.setLineDash(line.dash ?? []);
      context.beginPath();
      coordinates.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
      context.stroke();
      context.setLineDash([]);
      if (line.arrow && coordinates.length > 1) {
        const [a, b] = coordinates.slice(-2);
        if (math.norm(math.sub(a, b)) > 4) {
          const theta = Math.atan2(b[1] - a[1], b[0] - a[0]);
          context.beginPath();
          context.moveTo(b[0] - 9 * Math.cos(theta - 0.5), b[1] - 9 * Math.sin(theta - 0.5));
          context.lineTo(...b);
          context.lineTo(b[0] - 9 * Math.cos(theta + 0.5), b[1] - 9 * Math.sin(theta + 0.5));
          context.stroke();
        }
      }
    });
    context.globalAlpha = 1;
    layers.points.forEach(({point, color, radius}) => mark(point, radius, color));
    mark(current.point, 5, "text", true);
  }

  function render() {
    if (!state.examples.length) return;
    const episode = state.examples[state.example];
    const frame = episode.frames[state.frame];
    const current = episode.states[state.frame];
    $("clock").dateTime = frame.utc;
    $("clock").textContent = utc(frame.utc);
    $("edges").replaceChildren();
    frame.edges.forEach((edge) => {
      const row = $("edges").insertRow();
      [edge.from + " → " + edge.to, edge.side.replace("_", " "), edge.bps.toFixed(3),
        Number(edge.age).toLocaleString() + " ms"].forEach((value) => cell(row, "td", value));
    });
    const components = state.examples.map((item, index) => ({
      center: item.center, variance: index === 2 ? 0.13 : 0.18, mass: index === state.example ? state.mass : 1,
    }));
    const layers = scene(current, components);
    renderChart(layers, current, components);
    const locationState = new URLSearchParams({mode: state.mode, example: episode.id, frame: state.frame});
    history.replaceState(null, "", "?" + locationState);
  }

  function selectMode(mode) {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.mode = mode;
    const [title, chart, explanation] = views[mode];
    $("title").textContent = title;
    $("chart-label").textContent = chart;
    $("explainer").textContent = explanation;
    const markKey = {
      forest: "Square: observed state. Solid paths: alternatives. Copper: highest current score.",
      analogy: "Square: current state. Dashed arrow: earlier displacement. Solid arrow: transferred displacement.",
      steering: "Square: observed state. Solid arrow: loop basis. Dashed arrow: spread basis.",
      flow: "Square: observed state. Shading: reward density. Lines: trajectories. Copper dots: terminal states.",
    };
    $("description").textContent = markKey[mode] + " Gray points are the 93 observed frame embeddings.";

    document.querySelectorAll("[data-latent-mode]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.latentMode === mode)));
    if (state.examples.length) paintControls();
    render();
  }

  function theme(value) {
    document.documentElement.dataset.theme = value;
    document.querySelectorAll("[data-reasoning-theme]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.reasoningTheme === value)));
    try { localStorage.setItem("phaseweave-theme", value); } catch {}
    render();
  }
  try { theme(localStorage.getItem("phaseweave-theme") === "light" ? "light" : "dark"); } catch {}
  document.querySelectorAll("[data-reasoning-theme]").forEach((button) =>
    button.addEventListener("click", () => theme(button.dataset.reasoningTheme)));
  document.querySelectorAll("[data-latent-mode]").forEach((button) =>
    button.addEventListener("click", () => selectMode(button.dataset.latentMode)));
  $("example").addEventListener("change", () => {
    state.example = Number($("example").value);
    state.frame = 0;
    $("frame").value = "0";
    state.source = -1;
    paintControls();
    render();
  });
  $("frame").addEventListener("input", () => {
    state.frame = Number($("frame").value);
    render();
  });
  new ResizeObserver(render).observe($("chart"));

  selectMode(state.mode);
  fetch("replay.json").then((response) => {
    if (!response.ok) throw new Error("archive unavailable");
    return response.json();
  }).then((examples) => {
    state.examples = examples.map((item) => {
      const states = item.frames.map(math.marketState);
      return {...item, states, center: math.mean(states.map((sample) => sample.point))};
    });
    state.basis = math.conceptBasis(state.examples.flatMap((item) => item.states));
    state.example = Math.max(0, state.examples.findIndex(({id}) => id === qs.get("example")));
    state.examples.forEach((item, index) => $("example").append(new Option(item.label, index)));
    $("example").value = String(state.example);
    const limit = state.examples[state.example].frames.length - 1;
    const frame = Number(qs.get("frame"));
    state.frame = Number.isInteger(frame) && frame >= 0 && frame <= limit ? frame : 0;
    $("frame").max = String(limit);
    $("frame").value = String(state.frame);
    $("example").disabled = false;
    $("frame").disabled = false;
    selectMode(state.mode);
  }).catch(() => {
    $("error").textContent = "The recorded market data could not be loaded. Reload this page or open the archived replay JSON below.";
  });
})();
