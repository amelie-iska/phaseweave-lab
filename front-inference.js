"use strict";

(() => {
  const get = id => document.getElementById("trace-" + id);
  const corpus = "fx-liquid";
  const isLocal = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const endpoint = isLocal && location.port === "8132"
    ? "http://127.0.0.1:8155/api/inference-trace" : "/api/inference-trace";
  const state = {method: "forest", events: [], cursor: -1, follow: true, controller: null, timer: null};
  const forestColors = ["jade", "copper", "blue", "violet"];
  const vector = xs => xs.map(x => Number(x).toFixed(4)).join(", ");
  const origin = [0, 0, 0];
  const canvas = get("canvas");
  const stream = get("events");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  function palette() {
    const root = getComputedStyle(document.documentElement);
    const values = {line: "--line", muted: "--muted", jade: "--jade", copper: "--copper",
      blue: "--latent-blue", violet: "--latent-violet", text: "--text"};
    return Object.fromEntries(Object.entries(values).map(([name, key]) => [name,
      root.getPropertyValue(key).trim() || ({blue:"#5a9dd1", violet:"#bd87ea"}[name] ?? "#647f78")]));
  }

  function forestScene(events) {
    const nodes = new Map(), lines = [];
    const parallel = get("layout").value === "parallel";
    for (const event of events) {
      const {depth, points} = event.data;
      if (!Array.isArray(points)) continue;
      for (const item of points) {
        const id = [depth,item.tree,item.index].join("/");
        const point = [...item.point];
        if (parallel) point[1] += (item.tree - ((events[0]?.data.roots ?? 8) - 1)/2) * 0.70;
        const color = forestColors[item.tree % forestColors.length];
        const node = {id, point, color, radius: item.retained ? 4.3 : 2.1,
          alpha: item.feasible ? (item.retained ? 1 : 0.46) : 0.22};
        const parent = nodes.get([depth-1,item.tree,item.parent].join("/"));
        if (parent) lines.push({coords:[parent.point,point],color,
          alpha:item.retained ? 0.74 : 0.23, width:item.retained ? 1.5 : 1});
        nodes.set(id, node);
      }
    }
    const vote = events.find(event => event.stage === "consensus")?.data.point;
    if (vote) nodes.set("median", {id:"median",point:vote,color:"text",square:true,radius:5,label:"Median"});
    return {points:[...nodes.values()],lines,axes:["Forward Δ",parallel ? "Reverse Δ + tree offset" : "Reverse Δ","Log move"]};
  }

  function latentScene(events, analogy) {
    const points = [{point:origin,color:"text",radius:4,square:true,label:analogy?"Query":"Unedited"}], lines = [];
    const steps = events.filter(event => event.stage === (analogy ? "neighbor" : "dose"));
    for (const [index,{data}] of steps.entries()) {
      const recent = index === steps.length - 1;
      const color = analogy ? "jade" : data.dose < 0 ? "copper" : "violet";
      const id = analogy ? data.rank : data.dose;
      points.push({id,point:data.point,color,radius:recent?5:3,alpha:recent?1:0.62,
        label:recent? (analogy?"#"+id:"Dose "+id):undefined});
      lines.push({coords:[origin,data.point],color,arrow:recent,alpha:recent?0.85:0.30});
    }
    return {points,lines,axes:["PC 1","PC 2","PC 3"]};
  }

  function description(event) {
    const d = event.data;
    switch (event.stage) {
      case "start": return d.method === "forest"
        ? d.roots + " trees · " + d.depth + " layers · up to " + d.branch + " children per parent."
        : "Opened inference worker.";
      case "input": return d.frames + " historical frames · " + d.edges + " directed edges · one-second forecast.";
      case "roots": return d.evaluated + " roots scored.";
      case "expansion": return "Depth " + d.depth + " · " + d.evaluated + " proposals · " + d.surviving + " retained.";
      case "repair": return d.evaluated + " learned edits scored · " + d.active_trees.length + " eligible votes.";
      case "consensus": return d.eligible ? "Median reconstruction · margin Δ " + vector(d.forecast_delta_log_bps) + " log bps."
        : "Insufficient eligible votes. Returned persistence.";
      case "encode": return d.latent_width + " latent coordinates" + (d.bank_size ? " · " + d.bank_size + " eligible-bank vectors" : "") + ".";
      case "neighbor": return "Neighbor " + d.rank + " · distance " + Number(d.distance).toFixed(4) + ".";
      case "transport": return "Analogue candidate " + vector(d.transport_forecast_log_bps) + " log bps · selected weight " + d.selected_weight + ".";
      case "dose": return "Axis " + d.axis + " · dose " + d.dose + " · forecast Δ "
        + vector(d.forecast_delta_log_bps) + " log bps · probe Δ " + vector(d.concept_delta_sd) + " σ.";
      case "output": return "Forecast " + vector(d.forecast_log_bps) + " log bps, forward and reverse."
        + (d.selected_weight === 0 ? " The selected forecast uses zero analogue weight." : "");
      case "end": return "Inference completed.";
      case "error": return d.message;
      default: return event.stage;
    }
  }

  function scene() {
    const visible = state.events.slice(0,state.cursor + 1);
    return state.method === "forest" ? forestScene(visible) : latentScene(visible,state.method === "analogy");
  }

  const draw = Reasoning3D.bind(canvas,get("camera"),render,id => {
    const hit = scene().points.find(candidate => candidate.id === id);
    if (hit) get("detail").textContent = "Selected " + id + " · display coordinates (" + vector(hit.point) + ").";
  });

  function render() {
    draw(scene(),palette());
    const current = state.events[state.cursor];
    if (current) get("detail").textContent = description(current);
    get("step").value = Math.max(0,state.cursor);
    [...stream.children].forEach((row,index) => {
      if (index === state.cursor) row.setAttribute("aria-current","step");
      else row.removeAttribute("aria-current");
    });
    if (state.follow && current) {
      const row = stream.children[state.cursor];
      stream.scrollTop = Math.max(0,row.offsetTop - stream.offsetTop - stream.clientHeight + row.clientHeight);
    }
  }

  function follow(value) {
    state.follow = value;
    get("follow").setAttribute("aria-pressed",value);
    if (value) animate();
  }

  function animate() {
    if (!state.follow || state.timer !== null || state.cursor + 1 >= state.events.length) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (!state.follow) return;
      state.cursor = reduced.matches ? state.events.length-1 : state.cursor+1;
      render();
      animate();
    }, reduced.matches ? 0 : Number(get("interval").value));
  }

  function eventText(event) {
    const line = document.createElement("li"), button = document.createElement("button");
    button.type = "button";
    button.textContent = Number(event.elapsed_ms).toFixed(1) + " ms · " + description(event);
    button.addEventListener("click",() => { follow(false);state.cursor=event.seq;render(); });
    line.append(button);
    return line;
  }

  function ingest(event,run) {
    if (event.schema !== "phaseweave.live-inference.v1" || typeof event.run_id !== "string"
        || event.seq !== state.events.length || (run.id && event.run_id !== run.id)) {
      throw Error("Invalid inference stream sequence");
    }
    run.id = event.run_id;
    state.events.push(event);
    stream.append(eventText(event));
    get("step").disabled = false;
    get("step").max = event.seq;
    get("follow").disabled = false;
    if (event.stage === "output") get("state").textContent = "Output received";
    if (event.stage === "error") throw Error(event.data.message);
    if (event.stage === "end") run.ended = true;
    animate();
  }

  async function run() {
    if (state.controller || !isLocal) return;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    state.method = get("method").value;
    state.events = [];
    state.cursor = -1;
    state.controller = new AbortController();
    const controller = state.controller;
    const result = {id:null,ended:false};
    stream.replaceChildren();
    get("state").textContent = "Running model";
    get("detail").textContent = "Waiting for computation steps.";
    get("step").disabled = true;
    get("step").max = 0;
    get("follow").disabled = true;
    get("run").disabled = true;
    get("cancel").disabled = false;
    follow(true);
    render();
    try {
      const query = new URLSearchParams({method:state.method,preset:corpus,axis:get("axis").value,
        roots:get("roots").value,depth:get("depth").value,branch:get("branch").value});
      const response = await fetch(endpoint + "?" + query, {headers:{Accept:"application/x-ndjson"},signal:controller.signal});
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("application/x-ndjson")) throw Error("No model stream");
      const source = response.body.getReader();
      const decode = new TextDecoder();
      let buffer = "";
      async function read() {
        while (true) {
          const {value,done} = await source.read();
          if (controller.signal.aborted) return;
          buffer += decode.decode(value,{stream:!done});
          const rows = buffer.split("\n");
          buffer = rows.pop();
          for (const text of rows) if (text) ingest(JSON.parse(text),result);
          if (done) break;
          if (buffer.length > 250000) throw Error("Oversize model event");
        }
      }
      try { await read(); } finally { await source.cancel().catch(() => {}); }
      if (!result.ended || buffer) throw Error("Incomplete model stream");
      get("state").textContent = "Run complete";
    } catch {
      get("state").textContent = controller.signal.aborted ? "Run cancelled" : "Local inference unavailable";
    } finally {
      state.controller = null;
      get("run").disabled = false;
      get("cancel").disabled = true;
    }
  }

  get("method").addEventListener("change",() => {
    get("axis-control").hidden = get("method").value !== "graphcg";
    for (const control of document.querySelectorAll(".trace-forest-only")) {
      control.hidden = get("method").value !== "forest";
    }
  });
  get("layout").addEventListener("change",render);
  get("step").addEventListener("input",() => { follow(false);state.cursor=Number(get("step").value);render(); });
  get("follow").addEventListener("click",() => follow(!state.follow));
  get("run").addEventListener("click",run);
  get("cancel").addEventListener("click",() => state.controller?.abort());
  new ResizeObserver(render).observe(canvas);
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  if (!isLocal) {
    get("run").disabled = true;
    get("state").textContent = "Open local runner";
  }
  render();
})();
