"use strict";

(() => {
  const get = id => document.getElementById("trace-" + id);
  const corpus = "fx-liquid";
  const isLocal = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const legacyEndpoint = isLocal && location.port === "8132"
    ? "http://127.0.0.1:8155/api/inference-trace" : "/api/inference-trace";
  const state = {method: "joint", events: [], cursor: -1, follow: true, controller: null, timer: null};
  const forestColors = ["jade", "copper", "blue", "violet"];
  const vector = xs => xs.map(x => Number(x).toFixed(4)).join(", ");
  const origin = [0, 0, 0];
  const canvas = get("canvas");
  const stream = get("events");
  const concepts = ["Signed loop imbalance", "Mean pair spread", "Missing-history fraction", "Log loop dispersion"];
  const jointConcepts = ["Signed circulation per leg", "Half-spread per leg", "Missing leg fraction", "Loop dispersion"];
  const conceptSelectors = ["x","y","z"].map(axis => get("concept-" + axis));
  const selectedConcepts = [0,1,3];
  conceptSelectors.forEach((select, axis) => {
    concepts.forEach((label, index) => select.add(new Option(label, index)));
    select.value = selectedConcepts[axis];
    select.addEventListener("change", () => {
      const picked = Number(select.value);
      const other = selectedConcepts.indexOf(picked);
      if (other >= 0 && other !== axis) {
        selectedConcepts[other] = selectedConcepts[axis];
        conceptSelectors[other].value = selectedConcepts[other];
      }
      selectedConcepts[axis] = picked;
      render();
    });
  });
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
      const point = analogy ? data.point : selectedConcepts.map(i => data.concept_delta_sd[i]);
      points.push({id,point,color,radius:recent?5:3,alpha:recent?1:0.62,
        label:recent? (analogy?"#"+id:"Dose "+id):undefined});
      lines.push({coords:[origin,point],color,arrow:recent,alpha:recent?0.85:0.30});
    }
    return {points,lines,axes:analogy ? ["PC 1","PC 2","PC 3"] : selectedConcepts.map(i => concepts[i] + " (SD)")};
  }

  function cycleScene(events) {
    const points = events.filter(event => event.stage === "tenor").map(({data:d})=>({
      point:[d.canonical_log_bps,d.reverse_log_bps,Math.log1p(d.tenor_seconds)/2],
      color:d.selected?"jade":"violet",radius:d.selected?5:3,label:d.selected?d.tenor_seconds+" s":undefined,
    }));
    const lines = points.slice(1).map((p,i)=>({coords:[points[i].point,p.point],color:"jade",alpha:.6}));
    return {points,lines,axes:["Canonical margin","Reverse margin","log(1 + tenor) / 2"]};
  }

  function jointScene(events) {
    if (get("joint-view").value === "density") {
      const latest = events.filter(event => event.stage === "joint-density").at(-1)?.data;
      const probabilities = latest?.probabilities ?? [];
      const points = probabilities.flatMap((levels,wire) => levels.map((probability,level) => ({
        point: [(wire-1)*1.2,(level-1)*.76,probability*1.8],
        color:forestColors[level], cloud:12+29*Math.sqrt(probability), radius:2.5,
        alpha:.25+.7*probability, id:"q"+wire+" · |"+level+"⟩",
        label:"q"+wire+" · "+(probability*100).toFixed(1)+"%",
      })));
      return {points,lines:[],axes:["Wire","Basis level","Probability"], minExtent:1.9, framingScale:.36};
    }
    const paths = events.filter(event => event.stage === "joint-paths");
    const points = [], lines = [];
    paths.forEach(({data},stage) => {
      for (const [name,color] of [["forest","jade"],["flow","violet"]]) {
        data[name].forEach((point,index) => {
          points.push({id:name+" "+(index+1)+" · "+data.label,point,color,
            radius:stage===paths.length-1?5:3,alpha:.45+.5*data[name+"_weights"][index]});
          if (stage) lines.push({coords:[paths[stage-1].data[name][index],point],
            color,alpha:.7,arrow:stage===paths.length-1,dash:name==="flow"?[3,2]:[]});
        });
      }
    });
    return {points,lines,axes:["Path coordinate 1","Path coordinate 2","Path coordinate 3"]};
  }

  function description(event) {
    const d = event.data;
    switch (event.stage) {
      case "start": return d.method === "forest"
        ? d.roots + " trees · " + d.depth + " layers · up to " + d.branch + " children per parent."
        : d.method === "joint" ? "One joint forward pass · " + d.legs + " legs · " + d.tenor + " s tenor."
        : d.method === "cycle" ? d.legs+" assets · "+d.cadence+" s history spacing · "+d.tenor+" s forecast."
        : "Opened inference worker.";
      case "joint-input": return d.graph.join(" → ") + " · archived " + new Date(1000*d.anchor_utc_s).toISOString().slice(0,19)+" UTC.";
      case "joint-density": return "Qutrit basis probabilities · " + d.seconds_from_anchor + " s from anchor · " + d.probabilities.length + " wires.";
      case "joint-analogy": return "Four time-eligible analogues · weights " + vector(d.weights) + ".";
      case "joint-steer": return d.selected_concept + " offset " + d.selected_offset.toFixed(2) + " SD · " +
        d.concepts.map((key,i)=>key+" "+Number(d.concept_doses[i]).toFixed(3)+" SD").join(" · ") + ".";
      case "joint-paths": return d.label + " · " + d.forest.length + " forest continuations and " + d.flow.length + " sampled continuous paths.";
      case "joint-output": return d.selected_tenor + " s forecast " + d.selected_log_bps.toFixed(4) +
        " log bp · persistence " + d.persistence_log_bps.toFixed(4) + ".";
      case "input": return d.history_frames ? d.history_frames+" history frames · "+d.origins+" eligible October origins."
        : d.frames+" historical frames · "+d.edges+" directed edges · one-second forecast.";
      case "graph": return d.graph+" · "+d.eligible_route_origin_pairs+" paired route-origins"
        + (d.structural_extrapolation ? " · unseen five-leg length." : ".");
      case "tenor": return d.tenor_seconds+" s · two orientation means "+vector([d.canonical_log_bps,d.reverse_log_bps])
        +" log bps · persistence "+Number(d.mean_persistence_log_bps).toFixed(4)+".";

      case "roots": return d.evaluated + " roots scored.";
      case "expansion": return "Depth " + d.depth + " · " + d.evaluated + " proposals · " + d.surviving + " retained.";
      case "repair": return d.evaluated + " learned edits scored · " + d.active_trees.length + " eligible votes.";
      case "consensus": return d.eligible ? "Median reconstruction · margin Δ " + vector(d.forecast_delta_log_bps) + " log bps."
        : "Insufficient eligible votes. Returned persistence.";
      case "encode": return d.latent_width + " latent coordinates" + (d.bank_size ? " · " + d.bank_size + " eligible-bank vectors" : "") + ".";
      case "neighbor": return "Neighbor " + d.rank + " · distance " + Number(d.distance).toFixed(4) + ".";
      case "transport": return "Analogue candidate " + vector(d.transport_forecast_log_bps) + " log bps · selected weight " + d.selected_weight + ".";
      case "dose": return "Axis " + d.axis + " · dose " + d.dose + " · forecast Δ "
        + vector(d.forecast_delta_log_bps) + " log bps · " + concepts.map((name,i) => name + " " + Number(d.concept_delta_sd[i]).toFixed(3) + " SD").join(" · ") + ".";
      case "output": if (state.method === "cycle") return d.selected
        ? "Selected "+d.selected.tenor_seconds+" s · mean net margin "+Number(d.selected.mean_log_bps).toFixed(4)+" log bps."
        : (d.reason || "No eligible route history.");
        return "Forecast " + vector(d.forecast_log_bps) + " log bps, forward and reverse."
        + (d.selected_weight === 0 ? " The selected forecast uses zero analogue weight." : "");
      case "end": return "Inference completed.";
      case "error": return d.message;
      default: return event.stage;
    }
  }

  function scene() {
    const visible = state.events.slice(0,state.cursor + 1);
    if (state.method === "cycle") return cycleScene(visible);
    if (state.method === "joint") return jointScene(visible);
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
    if (event.stage === "output" || event.stage === "joint-output") get("state").textContent = "Output received";
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
      const endpoint = state.method === "joint" && location.port !== "8156"
        ? "http://127.0.0.1:8156/api/inference-trace" : legacyEndpoint;
      const query = new URLSearchParams(state.method === "joint"
        ? {method:"joint",preset:"k5-september",legs:get("legs").value,tenor:get("tenor").value,
          axis:get("axis").value,quarter:get("dose").value}
        : state.method === "cycle"
        ? {method:"cycle",preset:"fx-october-hour",legs:get("legs").value,cadence:get("cadence").value,tenor:get("tenor").value}
        : {method:state.method,preset:corpus,axis:get("axis").value,roots:get("roots").value,
          depth:get("depth").value,branch:get("branch").value});
      const response = await fetch(endpoint + "?" + query, {headers:{Accept:"application/x-ndjson"},signal:controller.signal});
      if (!response.ok) throw Error(response.status === 429 ? "Another local run is in progress." : "The worker rejected the inference settings.");
      if (!response.headers.get("Content-Type")?.startsWith("application/x-ndjson")) throw Error("The local inference service did not respond.");
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
    } catch (error) {
      get("state").textContent = controller.signal.aborted ? "Run cancelled" : "Local inference unavailable";
      if (!controller.signal.aborted) get("detail").textContent = error instanceof TypeError
        ? "Start the local inference runner on port " + (state.method === "joint" ? "8156" : "8155") + ", then retry."
        : error.message;
    } finally {
      state.controller = null;
      get("run").disabled = false;
      get("cancel").disabled = true;
    }
  }

  function methodControls() {
    const method = get("method").value;
    const steering = method === "graphcg";
    const joint = method === "joint";
    get("axis-control").hidden = !(steering || joint);
    const axis = get("axis");
    [...axis.options].forEach((option,i) => option.textContent = joint ? jointConcepts[i] : "Direction " + (i+1));
    get("concepts").hidden = !steering;
    for (const value of ["forest","cycle","joint","route"]) {
      const shown = value === "route" ? (joint || method === "cycle") : method === value;
      for (const control of document.querySelectorAll(".trace-"+value+"-only")) control.hidden = !shown;
    }
  }
  get("method").addEventListener("change",methodControls);
  get("dose").addEventListener("input",() => {get("dose-value").textContent=(Number(get("dose").value)/4).toFixed(2);});
  get("joint-view").addEventListener("change",render);
  methodControls();
  get("layout").addEventListener("change",render);
  get("step").addEventListener("input",() => { follow(false);state.cursor=Number(get("step").value);render(); });
  get("follow").addEventListener("click",() => follow(!state.follow));
  get("run").addEventListener("click",run);
  get("cancel").addEventListener("click",() => state.controller?.abort());
  new ResizeObserver(render).observe(canvas);
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  function view(name) {
    document.getElementById("inference").hidden = name !== "hosted";
    get("local").hidden = name !== "local";
    get("density").hidden = name !== "density";
    for (const option of ["hosted","local","density"]) {
      get("view-" + option).setAttribute("aria-pressed", option === name);
    }
    const frame = get("density-frame");
    if (name === "density" && !frame.getAttribute("src")) frame.src = frame.dataset.src;
    if (name === "local") render();
  }
  if (!isLocal) {
    get("local-body").hidden = true;
    get("local-note").hidden = false;
  }
  const viewForHash = () => location.hash === "#inference" ? "hosted"
    : location.hash === "#front-density" ? "density" : isLocal ? "local" : "hosted";
  for (const name of ["hosted","local","density"]) {
    get("view-" + name).addEventListener("click", () => view(name));
  }
  addEventListener("hashchange", () => view(viewForHash()));
  view(viewForHash());
  render();
})();
