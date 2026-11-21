"use strict";

(() => {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const svgNS = "http://www.w3.org/2000/svg";
  const utc = value => new Date(value).toISOString().slice(0, 23).replace("T", " ") + " UTC";
  const percent = value => (100 * value).toFixed(1) + "%";
  const get = (card, role) => card.querySelector(`[data-role="${role}"]`);
  const patterns = {
    "recurrent-r4-d2": [4, 2, 2],
    "recurrent-r8-d4": [8, 4, 3],
    "recurrent-r16-d8": [16, 8, 6],
  };
  const colors = Reasoning3D.colors;
  const nodes = [[160, 49], [66, 145], [254, 145]];
  let basketFeed;

  function playhead(card, onStep, onSeek, onPlayback) {
    const rate = get(card, "rate");
    const timeline = get(card, "timeline");
    const button = document.createElement("button");
    button.type = "button";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = slider.max = slider.value = "0";
    slider.disabled = true;
    slider.setAttribute("aria-label", get(card, "state").previousElementSibling.textContent + " playback position");
    const clock = document.createElement("time");
    clock.textContent = "Waiting for data";
    timeline.append(button, slider, clock);
    let enabled = !motion.matches;
    let timer;
    function schedule() {
      clearTimeout(timer);
      if (enabled && !document.hidden) timer = setTimeout(() => {
        onStep();
        schedule();
      }, Number(rate.value));
    }
    function play(value) {
      enabled = value;
      button.textContent = enabled ? "Pause" : "Play";
      schedule();
    }
    button.addEventListener("click", () => { play(!enabled); onPlayback?.(); });
    rate.addEventListener("change", schedule);
    slider.addEventListener("input", () => {
      play(false);
      onSeek(Number(slider.value));
    });
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", event => { if (event.matches) { play(false); onPlayback?.(); } });
    window.addEventListener("pagehide", () => clearTimeout(timer));
    window.addEventListener("pageshow", schedule);
    play(enabled);
    return {
      playing: () => enabled,
      update(index, count, text, date) {
        slider.max = Math.max(0, count - 1);
        slider.value = index;
        slider.disabled = count < 2;
        clock.textContent = text;
        if (date) clock.dateTime = date;
        else clock.removeAttribute("datetime");
      },
    };
  }

  function svg(tag, attributes, text) {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function plotWalk(plot, step, densities, assets) {
    const children = [];
    step.links.forEach((link, i) => {
      const start = nodes[link.source], end = nodes[link.target];
      const flux = step.flux[i];
      children.push(svg("line", {x1: start[0], y1: start[1], x2: end[0], y2: end[1], class: "replay-map-edge"}));
      if (!link.active || Math.abs(flux) < 1e-8) return;
      const [a, b] = flux > 0 ? [start, end] : [end, start];
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / distance, dy = (b[1] - a[1]) / distance;
      const [x, y] = [b[0] - dx * 34, b[1] - dy * 34];
      children.push(svg("g", {class: flux > 0 ? "replay-map-forward" : "replay-map-reverse"}));
      children.at(-1).append(
        svg("line", {x1: a[0] + dx * 32, y1: a[1] + dy * 32, x2: x, y2: y,
          "stroke-width": 1 + 6 * Math.sqrt(Math.abs(flux)), class: "replay-map-active"}),
        svg("path", {d: `M ${x} ${y} l ${-9*dx+4*dy} ${-9*dy-4*dx} m ${9*dx-4*dy} ${9*dy+4*dx} l ${-9*dx-4*dy} ${-9*dy+4*dx}`,
          "stroke-width": 2, class: "replay-map-active"}),
      );
    });
    nodes.forEach(([x, y], i) => {
      children.push(svg("circle", {cx: x, cy: y, r: 29, class: "replay-map-node"}));
      children.push(svg("circle", {cx: x, cy: y, r: 28 * Math.sqrt(densities[i]), class: "replay-map-density"}));
      children.push(svg("text", {x, y: y + 4, class: "replay-map-label"}, assets[i]));
    });
    plot.replaceChildren(...children);
  }

  function quoteReplay(card, examples, density, defaultMarket) {
    const source = get(card, "example"), state = get(card, "state"), caption = get(card, "source");
    const readout = get(card, "readout"), plot = get(card, "plot"), site = get(card, "site");
    const paintCloud = density ? DensityCloud.build(plot) : null;
    const sample = () => examples.find(example => example.id === source.value) || examples[0];
    let steps = [], cursor = 0, lastTick = "", kind = "waiting";
    let universe = [];
    const ageLimit = () => kind === "live" ? 5000 : 250;
    const options = () => ({
      mix: Number(get(card, "mix").value),
      phase: Number(get(card, "phase")?.value ?? 1),
      ageLimit: ageLimit(),
    });
    const timeline = playhead(card, advance, index => { cursor = index; render(); }, render);
    function inputAssets() {
      return kind === "live" ? steps.at(-1)?.frame.assets || GateSpotSources.assets(source.value) : sample()?.frames[0]?.assets || DensityWalk.fxAssets;
    }
    function updateSites(assets = inputAssets()) {
      if (assets.join() === universe.join()) return;
      universe = assets;
      if (site) {
        site.replaceChildren(...assets.map((asset, i) => new Option(asset, i)));
        site.disabled = false;
      }
    }
    function reset(frame, live) {
      kind = live ? "live" : "archive";
      updateSites(live ? frame.assets : undefined);
      const initial = Number(site?.value ?? 0);
      steps = live ? [DensityWalk.start(frame, initial, options())]
        : sample() ? DensityWalk.replay(sample().frames, initial, options()) : [];
      cursor = 0;
    }
    function rebuild() {
      if (kind === "live" && steps.length) {
        const previous = cursor;
        steps = DensityWalk.replay(steps.map(step => step.frame), Number(site?.value ?? 0), options());
        cursor = Math.min(previous, steps.length - 1);
      } else reset(null, false);
      render();
    }
    function render() {
      const step = steps[cursor];
      const fallback = GateSpotSources.has(source.value) && kind !== "live";
      state.textContent = kind === "live" ? (timeline.playing() ? "Live BBO" : "Pinned Gate snapshot")
        : step ? "Historical replay" : "Awaiting quotes";
      caption.textContent = kind === "live" ? `${step.frame.source} · sampled ${step.frame.assets.join(" / ")}`
        : step ? `HistData FX · ${sample().label.replace(/^FX · /, "")}${fallback ? " · Gate fresh books unavailable" : ""}`
        : "Gate public books unavailable. Historical replay is also unavailable.";
      if (!step) {
        readout.textContent = "";
        timeline.update(0, 0, "Awaiting quotes");
        return;
      }
      const assets = step.frame.assets || DensityWalk.fxAssets;
      const rows = step.state.map(vector => vector.map(DensityWalk.squared));
      const masses = rows.map(DensityWalk.total);
      const total = DensityWalk.total(masses);
      const active = step.links.filter(link => link.active).length;
      if (density) paintCloud(rows, assets, get(card, "color").value, Number(get(card, "angle").value),
        document.documentElement.dataset.theme === "light");
      else plotWalk(plot, step, masses, assets);
      const observation = kind === "live" ? Math.max(...step.frame.edges.map(edge => edge.updated)) : step.frame.utc;
      const indexLabel = kind === "live" ? `Sweep ${step.index}` : `Sweep ${step.index}/${steps.length - 1}`;
      timeline.update(cursor, steps.length, `${indexLabel} · ${utc(observation)}`, new Date(observation).toISOString());
      readout.textContent = density ? `Mass ${total.toFixed(6)} · ${active}/3 fresh links`
        : assets.map((asset, i) => `${asset} ${percent(masses[i])}`).join(" · ") + ` · ${active}/3 fresh links`;
    }
    function advance() {
      const live = GateSpotSources.has(source.value) ? GateSpotSources.snapshot(basketFeed, 5000, source.value) : null;
      if (live) {
        if (kind !== "live") reset(live.frame, true);
        else if (live.id !== lastTick) {
          steps.push(DensityWalk.next(steps.at(-1), live.frame, options()));
          if (steps.length > 96) steps.shift();
          cursor = steps.length - 1;
        }
        lastTick = live.id;
      } else {
        if (kind !== "archive") reset(null, false);
        else if (steps.length) cursor = (cursor + 1) % steps.length;
        lastTick = "";
      }
      render();
    }
    source.replaceChildren(...GateSpotSources.entries().map(([id, name]) => new Option(name, id)),
      ...examples.map(example => new Option(example.label, example.id)));
    source.value = defaultMarket;
    source.disabled = false;
    source.addEventListener("change", () => { kind = "waiting"; advance(); });
    for (const parameter of [get(card, "mix"), get(card, "phase"), site].filter(Boolean))
      parameter.addEventListener("input", rebuild);
    for (const field of [get(card, "angle"), get(card, "color")].filter(Boolean)) field.addEventListener("input", render);
    new ResizeObserver(render).observe(plot);
    new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]});
    advance();
  }

  function palette() {
    const css = getComputedStyle(document.documentElement);
    const aliases = {text: "--text", muted: "--muted", jade: "--jade", copper: "--copper", line: "--line"};
    return {blue: "#5a9dd1", violet: "#bd87ea",
      ...Object.fromEntries(Object.entries(aliases).map(([name, variable]) => [name, css.getPropertyValue(variable).trim()]))};
  }

  function localEndpoint() {
    const loopback = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    if (!loopback || location.protocol !== "http:") return null;
    if (location.port === "8132") return "http://127.0.0.1:8155/api/inference-trace";
    if (location.port === "8155") return "/api/inference-trace";
    return null;
  }

  async function streamForest(endpoint, profile, signal, onEvent) {
    const [roots, depth, branch] = patterns[profile] || patterns["recurrent-r8-d4"];
    const query = new URLSearchParams({method: "forest", preset: "fx-liquid", roots, depth, branch});
    const response = await fetch(endpoint + "?" + query, {signal, headers: {Accept: "application/x-ndjson"}});
    if (!response.ok || !response.headers.get("Content-Type")?.startsWith("application/x-ndjson"))
      throw new Error("Local forest inference unavailable");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", run, seq = 0, ended = false;
    try {
      while (!ended) {
        const {value, done} = await reader.read();
        buffer += decoder.decode(value, {stream: !done});
        const lines = buffer.split("\n");
        buffer = lines.pop();
        if (buffer.length > 250000) throw new Error("Oversize forest event");
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (seq >= 66 || event.seq !== seq || event.schema !== "phaseweave.live-inference.v1" ||
              typeof event.run_id !== "string" || (run && run !== event.run_id) || event.stage === "error")
            throw new Error("Invalid forest event");
          seq++;
          run = event.run_id;
          onEvent(event);
          ended = event.stage === "end";
        }
        if (done) break;
      }
      if (!ended || buffer) throw new Error("Incomplete forest trace");
    } finally {
      await reader.cancel().catch(() => {});
    }
  }

  function forestReplay(card) {
    const select = get(card, "example"), tree = get(card, "tree"), plot = get(card, "plot");
    const status = get(card, "state"), caption = get(card, "source"), readout = get(card, "readout");
    const endpoint = localEndpoint(), cache = new Map();
    let trace, cursor = 0, liveEvents = [], request, version = 0;
    let mode = "waiting", finished = false, selected;
    const draw = Reasoning3D.bind(plot, get(card, "camera"), render, id => { selected = id; render(); });
    const timeline = playhead(card, advance, index => { cursor = index; selected = undefined; render(); });
    function sourceTrees(n) {
      const old = tree.value;
      tree.replaceChildren(new Option("All trees", "all"),
        ...Array.from({length: n}, (_, i) => new Option("Tree " + (i + 1), String(i))));
      if ([...tree.options].some(option => option.value === old)) tree.value = old;
    }
    function advance() {
      selected = undefined;
      if (mode === "local" && liveEvents.length) {
        cursor = finished ? (cursor + 1) % liveEvents.length : Math.min(cursor + 1, liveEvents.length - 1);
      } else if (trace) cursor = (cursor + 1) % (trace.depth + 1);
      render();
    }
    function liveScene() {
      const visible = liveEvents.slice(0, cursor + 1);
      const nodes = new Map(), edges = [];
      const keep = tree.value;
      for (const step of visible) {
        const depth = step.data.depth;
        for (const [i, item] of (step.data.points || []).entries()) {
          if ((keep !== "all" && String(item.tree) !== keep) || !Array.isArray(item.point) ||
              item.point.length !== 3 || !item.point.every(Number.isFinite)) continue;
          const id = [depth, item.tree, item.index ?? i].join("/");
          nodes.set(id, {id, depth, point: item.point, tree: item.tree, status: item.retained ? "candidate" : "pruned"});
          const parent = [depth - 1, item.tree, item.parent].join("/");
          if (nodes.has(parent)) edges.push({source: parent, target: id, kind: step.stage === "repair" ? "repair" : "expansion"});
        }
        if (keep === "all" && step.stage === "consensus" && step.data.point?.length === 3)
          nodes.set("consensus", {id: "consensus", depth, point: step.data.point, tree: -1, label: "Consensus"});
      }
      const current = visible.at(-1);
      return {nodes: [...nodes.values()], edges, current, count: nodes.size};
    }
    function render() {
      let points = [], edges = [], names = ["Forward Δ", "Reverse Δ", "Log move"], detail = "Waiting for model trace.";
      if (mode === "local" && liveEvents.length) {
        const scene = liveScene();
        [points, edges] = [scene.nodes, scene.edges];
        const stage = scene.current;
        const elapsed = Number(stage.elapsed_ms).toFixed(1);
        timeline.update(cursor, liveEvents.length, `Step ${cursor + 1}/${liveEvents.length} · ${elapsed} ms from run start`);
        detail = `${stage.stage === "consensus" ? "Consensus" : "Layer " + stage.data.depth} · ${scene.count} visible states`;
      } else if (trace) {
        points = trace.trace.nodes.filter(node => node.depth <= cursor &&
          (tree.value === "all" || String(node.tree) === tree.value));
        edges = trace.trace.edges;
        names = trace.trace.coordinate_names || names;
        timeline.update(cursor, trace.depth + 1, `Layer ${cursor}/${trace.depth} · recorded model trace`);
        detail = `${points.length} retained display states · ${trace.trace.experiment?.evaluations_per_window ?? "—"} proposals scored`;
      }
      const hit = points.find(point => point.id === selected);
      if (hit) detail = `Tree ${hit.tree < 0 ? "consensus" : hit.tree + 1} · layer ${hit.depth} · ${hit.point.map(value => value.toFixed(3)).join(", ")}`;
      const scene = Reasoning3D.forestScene(points, edges, 100, 0, selected, names);
      draw(scene, palette());
      readout.textContent = detail;
    }
    function recordFallback(data, example) {
      trace = {trace: data, depth: ReasoningParallel.profile(data).depth};
      if (mode !== "local") {
        mode = "recorded";
        cursor = 0;
        sourceTrees(ReasoningParallel.profile(data).trees.length);
        status.textContent = "Recorded trace";
        caption.textContent = example.provenance;
        render();
      }
    }
    async function load(example) {
      const selectedVersion = ++version;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      cursor = 0;
      selected = undefined;
      liveEvents = [];
      trace = undefined;
      finished = false;
      mode = "waiting";
      status.textContent = "Loading";
      caption.textContent = endpoint ? "Waiting for local computation on archived FX." : "Loading recorded model trace.";
      render();
      const archived = (async () => {
        const data = cache.get(example.id) || await ReasoningParallel.loadTrace(example);
        cache.set(example.id, data);
        if (selectedVersion === version) recordFallback(data, example);
      })().catch(() => {
        if (selectedVersion === version && mode === "waiting") {
          status.textContent = "Trace unavailable";
          caption.textContent = "Neither a usable recorded trace nor a local computation is available yet.";
        }
      });
      if (!endpoint) return archived;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        await streamForest(endpoint, example.id, controller.signal, event => {
          if (selectedVersion !== version) return;
          if (!["roots", "expansion", "repair", "consensus"].includes(event.stage)) return;
          if (!liveEvents.length) {
            cursor = 0;
            mode = "local";
            sourceTrees((patterns[example.id] || patterns["recurrent-r8-d4"])[0]);
            status.textContent = "Local computation";
            caption.textContent = "PhaseWeave local inference · 16 archived October FX quote frames";
          }
          liveEvents.push(event);
          render();
        });
        if (selectedVersion === version && !liveEvents.length) throw new Error("Missing model stages");
        if (selectedVersion === version) finished = true;
      } catch {
        if (selectedVersion !== version) return;
        mode = "waiting";
        const available = cache.get(example.id);
        if (available) recordFallback(available, example);
        else await archived;
      } finally {
        clearTimeout(timeout);
      }
    }
    tree.addEventListener("change", () => { selected = undefined; render(); });
    new ResizeObserver(render).observe(plot);
    new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]});
    window.addEventListener("pagehide", () => { version++; request?.abort(); });
    ReasoningParallel.loadExamples().then(rows => {
      const calibrated = rows.filter(example => patterns[example.id]);
      const examples = calibrated.length ? calibrated : rows;
      select.replaceChildren(...examples.map(example => {
        const preset = patterns[example.id];
        return new Option(preset ? `${preset[0]} roots × ${preset[1]} layers` : example.label, example.id);
      }));
      select.value = examples.find(example => example.id === "recurrent-r8-d4")?.id || examples[0].id;
      select.disabled = false;
      const choice = () => examples.find(example => example.id === select.value);
      select.addEventListener("change", () => load(choice()));
      load(choice());
    });
  }

  const density = document.getElementById("replay-density");
  const walk = document.getElementById("replay-walk");
  const forest = document.getElementById("replay-forest");
  if (!(density && walk && forest)) return;
  const startFeed = () => { if (!basketFeed) basketFeed = GateSpotSources.connectBasket(); };
  startFeed();
  window.addEventListener("pagehide", () => { basketFeed?.stop(); basketFeed = null; });
  window.addEventListener("pageshow", startFeed);
  GateBasket.bind(document.getElementById("front-gate-basket"), () => basketFeed);
  forestReplay(forest);
  fetch("replay.json").then(response => {
    if (!response.ok) throw new Error("Historical FX replay unavailable");
    return response.json();
  }).then(examples => examples.filter(example => example.frames?.length > 1)).catch(() => []).then(examples => {
    quoteReplay(density, examples, true, "gate-eth");
    quoteReplay(walk, examples, false, "gate-xrp");
  });
})();
