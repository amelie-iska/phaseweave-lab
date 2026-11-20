"use strict";

(() => {
  const $ = (id) => document.getElementById("latent-" + id);
  const math = LatentReasoning;
  const qs = new URLSearchParams(location.search);
  const scenes = ReasoningScenes;
  const forests = ReasoningParallel;
  const views = {
    forest: ["Forest of Thought", "Learned forecast forest",
      "Explore recorded model candidates by search layer. Select a node to inspect its verifier score and local filtered complex."],
    analogy: ["Graph and forest analogy", "Directed correspondence across two graph planes",
      "Each eligible historical source is a tree. Its six leaves score currency bijections before a forecast displacement is transported."],
    steering: ["GraphCG-R concept steering", "Latent directions and measured concept responses",
      "Move along a learned direction or compare it with the initial and random controls. Dose changes the latent state while the readout stays frozen."],
    flow: ["Continuous GFlowNet", "Learned forward trajectories by stage",
      "Follow samples from a Gaussian base through the intermediate stage to the terminal state. Shading shows the pooled target reward at the terminal plane."],
  };
  const view = qs.get("mode");
  const state = {
    mode: Object.hasOwn(views, view) ? view : "forest",
    examples: [], example: 0, frame: 0, depth: 3, radius: .9, node: 0,
    expansion: true, correction: true, consensus: true,
    source: -1, mapping: -1, strength: 1,
    seedIndex: 0, editMethod: "trained", axis: 1, dose: 1,
    steeringProjection: "pca", concepts: [0,1,2],
    split: "test", stage: 2, count: 28, seed: 0, timer: null,
    forest: null, steering: null, flow: null,
    flowPath: ReasoningFlowPaths.choices.some(([id])=>id===qs.get("path")) ? qs.get("path") : "short",
    flowTrace: null, flowTraceError: false,
    forestExamples: [forests.defaultExample],
    forestExample: qs.get("forest") || forests.defaultExample.id,
    forestLoadedExample: null, forestPending: false, forestError: "",
    forestTree: -1, forestProfile: null, forestStep: "",
    forestLayout: qs.get("layout") === "coordinates" ? "coordinates" : "parallel",
  };
  const flowSplits = {"validation":"September validation","test":"October holdout","new_asset":"Unseen CHF"};
  const blank = () => ({axes:["X","Y","Z"],points:[],lines:[],faces:[]});
  let lastScene;
  const draw = Reasoning3D.bind($("chart"), $("camera"),
    () => { if (lastScene) draw(lastScene, colors()); },
    id => {
      if (state.mode === "forest") {
        state.node = Number(id);
        state.forestStep = "";
      }
      if (state.mode === "analogy") {
        const key = /^source-(\d+)-map-(\d+)$/.exec(id);
        if (!key) return;
        state.source = Number(key[1]);
        state.mapping = Number(key[2]);
      }
      paintControls();
      render();
    });
  let localScene;
  const redrawLocal = () => { if (localScene) drawLocal(localScene,colors()); };
  const drawLocal = Reasoning3D.bind(document.getElementById("forest-local-chart"),
    document.getElementById("forest-local-camera"), redrawLocal,
    id => {
      const node = state.forest?.nodes.find(n => n.id === Number(id));
      if (node) focusForest(node);
    });
  function focusForest(node, stage, depth) {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    state.node = node.id;
    state.forestTree = -1;
    state.forestStep = stage || "";
    state.depth = depth ?? Math.max(state.depth,node.depth);
    paintControls();
    render();
  }
  const asCoordinate = (vector) => "(" + vector.map((value) => value.toFixed(3)).join(", ") + ")";
  const utc = (value) => value.replace("T", " ").replace("+00:00", " UTC");
  const stamp = (frame) => Date.parse(frame.utc);
  function colors() {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(["line","muted","text","jade","copper","blue","violet"].map(name => [
      name, styles.getPropertyValue((name === "blue" || name === "violet" ? "--latent-" : "--") + name).trim()
    ]));
  }

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
      if (state.mode === "flow" && state.flowPath !== "short" && key === "stage" && state.timer) {
        clearInterval(state.timer);
        state.timer = null;
        $("path-playback").textContent = "Play ordered path";
      }
      if (key === "depth" && state.forest) {
        const nodes = forests.visibleNodes(state.forest,state);
        if (!nodes.some(node=>node.id === state.node)) state.node = nodes[0].id;
        const select = document.getElementById("latent-setting-node");
        select.replaceChildren(...nodes.map(node=>new Option(nodeLabel(node),node.id)));
        select.value = String(state.node);
      }
      update();
      render();
    });
    update();
    wrapper.htmlFor = input.id;
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

  function pick(key, label, rows) {
    const field = document.createElement("label");
    const selector = document.createElement("select");
    field.append(label, selector);
    selector.id = "latent-setting-" + key;
    for (const [value, name] of rows) selector.append(new Option(name, value));
    selector.value = String(state[key]);
    selector.addEventListener("change", () => {
      state[key] = typeof state[key] === "number" ? Number(selector.value) : selector.value;
      if (key === "source") state.mapping = -1;
      if (key === "flowPath") {
        loadFlowPath(true);
        return;
      }
      if (key === "forestExample") { loadForest(state.forestExample, true); return; }
      paintControls();
      render();
      document.getElementById(selector.id)?.focus();
    });
    return field;
  }

  function toggle(key, label) {
    const field = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = state[key];
    box.addEventListener("change", () => { state[key] = box.checked; render(); });
    field.append(label, box);
    return field;
  }

  function sourceMaps() {
    const episode = state.examples[state.example];
    return scenes.earlierMaps(episode.states[state.frame].point, episode.frames[state.frame],
      state.examples, state.example);
  }

  function play(key, limit) {
    if (state.timer) clearInterval(state.timer);
    state[key] = 0;
    paintControls();
    render();
    state.timer = setInterval(() => {
      state[key]++;
      paintControls();
      render();
      if (state[key] >= limit) { clearInterval(state.timer); state.timer = null; }
    }, 550);
  }

  function togglePathPlayback(end) {
    function show(stage) {
      const range = $("setting-stage");
      const output = range.parentElement.querySelector("output");
      state.stage = stage;
      range.value = String(stage);
      output.textContent = String(stage);
      render();
    }
    function stop() {
      clearInterval(state.timer);
      state.timer = null;
      $("path-playback").textContent = "Play ordered path";
    }
    if (state.timer) { stop(); return; }
    if (state.stage === end) show(0);
    $("path-playback").textContent = "Pause playback";
    state.timer = setInterval(() => {
      show(Math.min(state.stage+1,end));
      if (state.stage === end) stop();
    },550);
  }

  let flowRequest = 0;
  async function loadFlowPath(focus = false) {
    const request = ++flowRequest;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    state.flowTrace = null;
    state.flowTraceError = false;
    state.stage = state.flowPath === "short" ? 2 : 0;
    function refresh() {
      if (state.mode !== "flow") return;
      paintControls();
      render();
      if (focus) $("setting-flowPath")?.focus();
    }
    refresh();
    if (state.flowPath === "short") return;
    try {
      const trace = await ReasoningFlowPaths.load(state.flowPath);
      if (request !== flowRequest) return;
      state.flowTrace = trace;
      state.stage = trace.nodes.length-1;
    } catch {
      if (request !== flowRequest) return;
      state.flowTraceError = true;
    }
    refresh();
  }

  const nodeLabel = node => forests.treeLabel(node.tree) + ` · #${node.id} · ${node.label}`;
  let forestRequest = 0;
  const forestCache = new Map();

  async function loadForest(id, restoreFocus = false) {
    const example = state.forestExamples.find(item => item.id === id) || forests.defaultExample;
    const request = ++forestRequest;
    state.forestExample = example.id;
    state.forestPending = true;
    state.forestError = "";
    if (state.mode === "forest") { paintControls(); render(); }
    try {
      const trace = forestCache.get(example.id) || await forests.loadTrace(example);
      if (request !== forestRequest) return;
      forestCache.set(example.id,trace);
      const profile = forests.profile(trace);
      const root = trace.nodes.find(node => node.depth === 0 && node.tree >= 0);
      if (state.timer && state.mode === "forest") {
        clearInterval(state.timer);
        state.timer = null;
      }
      state.forest = trace;
      state.forestProfile = profile;
      state.forestLoadedExample = example;
      state.forestTree = -1;
      state.forestStep = "";
      state.node = root.id;
      state.depth = profile.depth;
      state.radius = Math.min(state.radius,profile.radius);
    } catch {
      if (request !== forestRequest) return;
      state.forestExample = state.forestLoadedExample?.id ?? forests.defaultExample.id;
      const error = `Could not load the measured trace for ${example.label}.`;
      if (!state.forestLoadedExample && example.id !== forests.defaultExample.id) {
        await loadForest(forests.defaultExample.id, restoreFocus);
      }
      state.forestError = error;
    }
    state.forestPending = false;
    if (state.mode === "forest") {
      paintControls();
      render();
      if (restoreFocus) document.getElementById("latent-setting-forestExample")?.focus();
    }
  }

  function paintControls() {
    const panel = $("controls");
    panel.replaceChildren();
    if (state.mode === "forest") {
      const selector = pick("forestExample","Measured trace",state.forestExamples.map(item=>[item.id,item.label]));
      selector.querySelector("select").disabled = state.forestPending;
      panel.append(selector,pick("forestLayout","Tree layout",[
        ["coordinates","Original forecast coordinates"],["parallel","Parallel tree lanes"],
      ]));
      if (state.forestPending || state.forestError) {
        const status = textBlock(state.forestError || "Loading the selected measured trace.");
        status.setAttribute("role","status");
        panel.append(status);
      }
      if (!state.forest) return;
      const {depth,radius,trees} = state.forestProfile;
      const nodes = forests.visibleNodes(state.forest,state);
      if (!nodes.some(node => node.id === state.node)) state.node = nodes[0].id;
      panel.append(pick("forestTree","Tree focus",[[-1,"All roots"],...trees.map(tree=>[tree,forests.treeLabel(tree)])]),
        slider("depth","Search depth",0,depth,1,0), slider("radius","Simplex radius",0,radius,.025),
        pick("node","Inspect generated node",nodes.map(node=>[node.id,nodeLabel(node)])),
        toggle("expansion","Show expansions"),toggle("correction","Show corrections"),toggle("consensus","Show consensus edges"),
        command("Play search growth",()=>play("depth",depth)));
    } else if (state.mode === "analogy" && state.examples.length) {
      const sources = sourceMaps();
      if (!sources.length) return;
      if (!sources.some(item=>item.index===state.source)) state.source = -1;
      const source = sources.find(item=>item.index===state.source) || sources[0];
      panel.append(pick("source","Earlier source",[[-1,"Best eligible source"],...sources.map(s=>[s.index,s.item.label])]),
        pick("mapping","Currency correspondence",[[-1,"Lowest distortion"],...source.ranked.map(c=>[
          c.order,`${c.map.map(v=>["EUR","USD","JPY"][v]).join(" / ")} · cost ${c.distortion.toFixed(3)}`
        ])]),slider("strength","Transfer strength λ",0,1.75,.05));
    } else if (state.mode === "steering" && state.steering) {
      panel.append(pick("seedIndex","Training seed",state.steering.runs.map((run,index)=>[index,run.seed])),
        pick("editMethod","Editor",[["trained","GraphCG-R trained"],["initial","Initial axes"],["random","Equal-norm random"]]),
        pick("axis","Edit direction",[1,2,3,4].map(axis=>[axis,`Axis ${axis}`])),
        slider("dose","Edit magnitude · signed dose",-2,2,.25),
        pick("steeringProjection","3D coordinates",[["pca","Latent space · PCA3"],["concepts","Three named concepts"]]),
        command("Reset dose",()=>{state.dose=0;paintControls();render();}));
      panel.append(command("Example · spread and dispersion",() => {
        Object.assign(state,{seedIndex:0,editMethod:"trained",axis:3,dose:1,steeringProjection:"concepts",concepts:[1,3,2]});
        paintControls(); render();
      }));
      if (state.steeringProjection === "concepts") {
        panel.append(...SteeringConcepts.fields(state.steering,state.concepts,indices => {
          state.concepts = indices; paintControls(); render();
        }));
      }
    } else if (state.mode === "flow") {
      panel.append(pick("flowPath","Trained sampler",ReasoningFlowPaths.choices));
      if (state.flowPath !== "short") {
        if (state.flowTrace) {
          const end = state.flowTrace.nodes.length-1;
          const playback = command(state.timer?"Pause playback":"Play ordered path",()=>togglePathPlayback(end));
          playback.id = "latent-path-playback";
          panel.append(slider("stage","Path frame",0,end,1,0),playback);
        } else if (state.flowTraceError) {
          panel.append(command("Retry loading path",()=>loadFlowPath(true)));
        }
        return;
      }
      if (!state.flow) return;
      panel.append(pick("split","Data split",Object.entries(flowSplits)),slider("stage","Flow stage",0,2,1,0),
        slider("count","Sampled trajectories",8,76,4,0),
        command("Play flow stages",()=>play("stage",2)),
        command("Show other sampled paths",()=>{state.seed++;render();}));
    }
  }

  function scene(current) {
    const panel = $("readout");
    panel.replaceChildren();
    if (state.mode === "forest" && state.forest) {
      const trace = state.forest;
      const meta = state.forestLoadedExample;
      const {result,pivot,shown,counts} = forests.scene(trace,state,Reasoning3D);
      const {trees,depth,widths} = state.forestProfile;
      localScene = ForestWalkthrough.render(trace,pivot,state.forestStep,state.radius,{
        stage: item => focusForest(item.node,item.id,item.depth ?? item.node.depth),
        node: item => focusForest(item),
      });
      const visibleLayer = shown.filter(node => node.depth === state.depth).length;
      const incoming = trace.edges.filter(edge => edge.target === pivot.id);
      $("chart-label").textContent = state.forestLayout === "parallel" ? "Parallel tree lanes" : "Original forecast coordinates";
      $("description").textContent = forests.purpose(state.forestLayout) +
        " Colored edges are expansions, dashed edges are corrections, and neutral arrows show votes. The linked local geometry panel keeps the original coordinates.";
      panel.append(textBlock(meta.provenance));
      const experiment = trace.experiment;
      const scope = experiment ? [
        ["Proposal unroll",`${experiment.inference_unroll} layers · ${experiment.branch_factor} proposals per expanded parent`],
        ["Inference budget",`${experiment.evaluations_per_window} candidates scored per window`],
      ] : [];
      panel.append(table("Selected learned forest node",["Property","Value"],[
        ["Trace scope",`${trees.length} roots · ${trace.nodes.length} displayed states · layers 0–${depth}`],
        ...scope,
        ["Layer width",`${visibleLayer} shown / ${widths[state.depth]} across all roots at layer ${state.depth}`],
        ["Tree and layer",`${forests.treeLabel(pivot.tree)} · ${pivot.depth}`],
        ["Node and role",`#${pivot.id} · ${pivot.label}`],["Status",pivot.status],
        ["Standardized coordinates",asCoordinate(pivot.point)],
        ["Verifier score",Number.isFinite(pivot.score) ? pivot.score.toFixed(5) : "No verifier score for this state"],
        ["Incoming trace links",incoming.map(edge => `#${edge.source} · ${edge.kind}`).join(", ") || "Root"],
        ["Visible candidate states",shown.length],
        ["Local simplices",`${counts[0]} vertices · ${counts[1]} edges · ${counts[2]} triangles`],
      ]));
      panel.append(textBlock(trace.provenance || "Model-generated candidate states on a recorded FX context."));
      return result;
    }
    if (state.mode === "analogy" && current) {
      const {result,source,candidate,prediction} = scenes.analogy(sourceMaps(),state.source,state.mapping,state.strength,current.point);
      if (!source) {
        panel.append(textBlock("Choose a later episode to reveal a mature source and its correspondence branches."));
        return result;
      }
      panel.append(table("Directed historical correspondence",["Property","Value"],[
        ["Earlier episode",source.item.label],["Evidence closed",utc(source.item.frames.at(-1).utc)],
        ["Mapped source order",candidate.map.map(i=>["EUR","USD","JPY"][i]).join(" / ")],
        ["Orientation",candidate.swap?"Reversed":"Kept"],["Relational distortion",candidate.distortion.toFixed(5)],
        ["Embedding displacement",asCoordinate(candidate.delta)],["Transported query",asCoordinate(prediction)],
      ]));
      return result;
    }
    if (state.mode === "steering" && state.steering) {
      const coordinates = SteeringConcepts.display(state.steering,state.steeringProjection,state.concepts);
      const {result,active,method} = scenes.steering(state.steering,state.seedIndex,state.editMethod,state.axis,state.dose,coordinates);
      const row = SteeringConcepts.pointAt(active.axis,state.dose);
      const conceptView = state.steeringProjection === "concepts";
      $("description").textContent = conceptView
        ? "The axes are the three selected observer changes in August target SD. Every color follows one edit direction through its measured doses. White marks the selected dose."
        : "The four colors show edit directions in the same August PCA frame. White marks the selected dose. The first three PCs retain 81.79% of state variance; a direction may project to a short line.";
      panel.append(table("Measured steering intervention",["Setting","Value"],[
        ["Coordinates",coordinates.axes.join(" / ")],["Selected point",asCoordinate(active.point)],
        ["Forward forecast Δ",SteeringConcepts.signed(row.margin_delta_bps[0],5)+" log bps"],
        ["Reverse forecast Δ",SteeringConcepts.signed(row.margin_delta_bps[1],5)+" log bps"],
      ]),textBlock("Forecast changes are measured at the chosen dose using the frozen nonlinear readout on the same 1,024 October windows."));
      SteeringConcepts.report($("concept-values"),state.steering,method,state.axis,state.dose,table,textBlock);
      return result;
    }
    if (state.mode === "flow" && state.flowPath !== "short") {
      $("chart-label").textContent = state.flowPath === "edited" ? "Eight expansions and a final edit" : "Eight expansions from one root";
      $("explainer").textContent = "Replay one draw from a trained path sampler conditioned on a historical FX graph. Each frame appends one generated state.";
      $("description").textContent = "Blue marks the root. Jade arrows follow expansions. A dashed copper arrow and square mark an edit when present. All three axes use standardized August forecast coordinates.";
      const trace = state.flowTrace;
      if (!trace) {
        const msg = textBlock(state.flowTraceError ? "This measured path could not be verified. Retry or select the short sampler." : "Loading the measured path.");
        msg.setAttribute("role","status");
        panel.append(msg);
        return blank();
      }
      const node = trace.nodes[state.stage];
      panel.append(table("Sampled ordered GFlowNet path",["Property","Value"],[
        ["Frame",`${state.stage+1} of ${trace.nodes.length} · ${ReasoningFlowPaths.label(state.stage)}`],
        ["Forward Δ / reverse Δ / log magnitude",asCoordinate(node.point)],
        ["Evidence branch",`Tree ${trace.tree+1} of 16 · ${trace.alternative===2?"repair of finalist 2":"finalist "+(trace.alternative+1)}`],
        ["Source","September validation · first eligible sampled condition"],
        ["Policy checkpoint",`2,048 updates · training seed ${trace.policy_seed}`],
        ["Policy draw",`Draw ${trace.draw_number} · seed ${trace.sample_seed}`],
      ]),textBlock("The two long paths are independent draws on the same graph. The edit appends a state after expansion eight and preserves the preceding state."));
      return ReasoningFlowPaths.scene(trace,state.stage);
    }
    if (state.mode === "flow" && state.flow) {
      $("chart-label").textContent = views.flow[1];
      $("explainer").textContent = views.flow[2];
      $("description").textContent = "Blue dots are base samples, violet dots are intermediate states, and copper dots are terminal states. The third axis is stage.";
      const {result,report} = scenes.flow(state.flow,state.split,state.count,state.seed,state.stage);
      panel.append(table("Learned continuous sampler",["Property","Value"],[
        ["Stage",["Base sample z₀","Intermediate z₁","Terminal y"][state.stage]],
        ["Selection step",state.flow.step],["Conditioning windows",report.number_of_conditioning_windows],
        ["Target-to-model terminal KL",report.heldout_terminal_kl_nats.toFixed(5)+" nats"],
        ["Displayed bank balance RMSE",report.display_balance_rmse.toFixed(5)],
      ]));
      return result;
    }
    panel.append(textBlock("Loading the measured trace."));
    return blank();
  }

  function render() {
    const episode = state.examples[state.example];
    const frame = episode?.frames[state.frame];
    const current = episode?.states[state.frame];
    if (frame) {
      $("clock").dateTime = frame.utc;
      $("clock").textContent = utc(frame.utc);
      $("edges").replaceChildren();
      frame.edges.forEach((edge) => {
        const row = $("edges").insertRow();
        [edge.from + " → " + edge.to, edge.side.replace("_", " "), edge.bps.toFixed(3),
          Number(edge.age).toLocaleString() + " ms"].forEach((value) => cell(row, "td", value));
      });
    }
    const showForest = state.mode === "forest" && Boolean(state.forest);
    document.getElementById("forest-guide").hidden = !showForest;
    document.getElementById("forest-audit").hidden = !showForest;
    lastScene = scene(current);
    draw(lastScene, colors());
    if (showForest) redrawLocal();
    const locationState = new URLSearchParams({mode: state.mode});
    if (episode) {
      locationState.set("example",episode.id);
      locationState.set("frame",state.frame);
    }
    if (state.mode === "forest") {
      locationState.set("forest",state.forestExample);
      locationState.set("layout",state.forestLayout);
    }
    if (state.mode === "flow" && state.flowPath !== "short") locationState.set("path",state.flowPath);
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
    const key = {
      forest: "Choose a measured trace and a tree layout.",
      analogy: "Arrows show the source and query cycles. Dashed cross-links match their vertices. Select a forest leaf to inspect a competing map.",
      steering: "The four colors distinguish edit directions. The white point is the selected dose. Axis lengths preserve the original PCA projection.",
      flow: "Blue dots are base samples, violet dots are intermediate states, and copper dots are terminal states. The third axis is stage.",
    };
    $("description").textContent = key[mode];
    $("inputs").hidden = mode !== "analogy";
    $("concept-report").hidden = mode !== "steering";


    document.querySelectorAll("[data-latent-mode]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.latentMode === mode)));
    paintControls();
    render();
  }

  function theme(value) {
    document.documentElement.dataset.theme = value;
    document.querySelectorAll("[data-reasoning-theme]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.reasoningTheme === value)));
    try { localStorage.setItem("phaseweave-theme", value); } catch {}
    render();
  }
  new ResizeObserver(redrawLocal).observe(document.getElementById("forest-local-chart"));
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
    state.mapping = -1;
    paintControls();
    render();
  });
  $("frame").addEventListener("input", () => {
    state.frame = Number($("frame").value);
    state.mapping = -1;
    paintControls();
    render();
  });
  new ResizeObserver(render).observe($("chart"));

  selectMode(state.mode);
  if (state.flowPath !== "short") loadFlowPath();
  forests.loadExamples().then(examples => {
    state.forestExamples = examples;
    loadForest(state.forestExample);
  });
  fetch("replay.json").then((response) => {
    if (!response.ok) throw new Error("archive unavailable");
    return response.json();
  }).then((examples) => {
    state.examples = examples.map((item) => {
      const states = item.frames.map(math.marketState);
      return {...item, states};
    });
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
  for (const [key,file] of Object.entries({
    steering:"steering-concepts-v3.json",flow:"flow-view-v1.json"
  })) fetch(file).then(response => {
    if (!response.ok) throw new Error("trace unavailable");
    return response.json();
  }).then(data => {
    state[key] = data;
    if (state.mode === key) { paintControls(); render(); }
  }).catch(() => { $("error").textContent = "A measured reasoning trace could not load."; });
})();
