"use strict";

(() => {
  const $ = (id) => document.getElementById("latent-" + id);
  const math = LatentReasoning;
  const qs = new URLSearchParams(location.search);
  const scenes = ReasoningScenes;
  const views = {
    forest: ["Forest of Thought", "Four learned forecast trees",
      "Grow the trained candidates under a shared search budget. Select a node to inspect its local filtered complex."],
    analogy: ["Graph and forest analogy", "Directed correspondence across two graph planes",
      "Each eligible historical source is a tree. Its six leaves score currency bijections before a forecast displacement is transported."],
    steering: ["GraphCG-R concept steering", "Learned directions projected into three PCs",
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
    split: "test", stage: 2, count: 28, seed: 0, timer: null,
    forest: null, steering: null, flow: null,
  };
  const flowSplits = {"validation":"September validation","test":"October holdout","new_asset":"Unseen CHF"};
  const blank = () => ({axes:["X","Y","Z"],points:[],lines:[],faces:[]});
  let lastScene;
  const draw = Reasoning3D.bind($("chart"), $("camera"),
    () => { if (lastScene) draw(lastScene, colors()); },
    id => {
      if (state.mode === "forest") state.node = Number(id);
      if (state.mode === "analogy") {
        const key = /^source-(\d+)-map-(\d+)$/.exec(id);
        if (!key) return;
        state.source = Number(key[1]);
        state.mapping = Number(key[2]);
      }
      paintControls();
      render();
    });
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
      if (key === "depth" && state.forest) {
        const nodes = state.forest.nodes.filter(node=>node.depth <= state.depth);
        if (!nodes.some(node=>node.id === state.node)) state.node = nodes[0].id;
        const select = document.getElementById("latent-setting-node");
        select.replaceChildren(...nodes.map(node=>new Option(nodeLabel(node),node.id)));
        select.value = String(state.node);
      }
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

  const nodeLabel = node => (node.tree < 0 ? "Consensus" : `Tree ${node.tree+1}`) + ` · node ${node.id} · ${node.label}`;

  function paintControls() {
    const panel = $("controls");
    panel.replaceChildren();
    if (state.mode === "forest" && state.forest) {
      const limit = Math.max(...state.forest.nodes.map(node => node.depth));
      const nodes = state.forest.nodes.filter(node => node.depth <= state.depth);
      if (!nodes.some(node => node.id === state.node)) state.node = nodes[0].id;
      panel.append(slider("depth","Search budget",0,limit,1,0), slider("radius","Simplex radius",0,2.5,.025),
        pick("node","Inspect generated node",nodes.map(node=>[node.id,nodeLabel(node)])),
        toggle("expansion","Show expansions"),toggle("correction","Show corrections"),toggle("consensus","Show consensus"),
        command("Play search growth",()=>play("depth",limit)));
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
        pick("axis","Direction",[1,2,3,4].map(axis=>[axis,`Axis ${axis}`])),slider("dose","Embedding dose",-2,2,.05),
        command("Reset dose",()=>{state.dose=0;paintControls();render();}));
    } else if (state.mode === "flow" && state.flow) {
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
      const source = state.forest;
      const shown = source.nodes.filter(node=>node.depth<=state.depth);
      const pivot = shown.find(node=>node.id===state.node) || shown[0];
      const edges = source.edges.filter(edge => edge.kind === "expansion" ? state.expansion :
        edge.kind.includes("consensus") ? state.consensus : state.correction);
      const result = Reasoning3D.forestScene(source.nodes,edges,state.depth,0,pivot.id,
        ["Forward Δ","Reverse Δ","Log move"]);
      const coords = new Map(shown.map(n=>[n.id,n.point]));
      let cells=0;
      for (const simplex of source.local_complexes[pivot.id]?.simplices || []) {
        if (simplex.birth > state.radius || !simplex.vertices.every(id=>coords.has(id))) continue;
        const vertices = simplex.vertices.map(id=>coords.get(id));
        if (vertices.length===2) result.lines.push({coords:vertices,color:"violet",dash:[2,3],alpha:.75});
        else if (vertices.length===3) result.faces.push({coords:vertices,color:"violet",alpha:.15});
        cells++;
      }
      panel.append(table("Selected learned forest node",["Property","Value"],[
        ["Origin","Historical validation context"],["Tree",pivot.tree<0 ? "Consensus" : pivot.tree+1],
        ["Node and role",`${pivot.id} · ${pivot.label}`],["Status",pivot.status],
        ["Standardized coordinates",asCoordinate(pivot.point)],["Verifier score",Number(pivot.score).toFixed(5)],
        ["Visible candidate states",shown.length],["Local simplices at radius",cells]
      ]));
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
      const {result,active,method} = scenes.steering(state.steering,state.seedIndex,state.editMethod,state.axis,state.dose);
      panel.append(table("Projected concept intervention",["Property","Value"],[
        ["Editor",method.id],["Training origin","August latent centroid"],
        ["Axis projection",asCoordinate(active.axis.unit_vector_pca3)],["Edited position",asCoordinate(active.point)],
        ["Forecast change, log bps",asCoordinate(active.outcome)],
        ["State variance in 3 PCs",(100*state.steering.explained_variance_fraction.reduce((a,b)=>a+b,0)).toFixed(2)+"%"],
      ]));
      return result;
    }
    if (state.mode === "flow" && state.flow) {
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
    lastScene = scene(current);
    draw(lastScene, colors());
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
    const key = {
      forest: "Colored branches identify the four trees. Dashed links are learned corrections. White edges cast votes into consensus. Violet links and faces show the selected local complex.",
      analogy: "Arrows show the source and query cycles. Dashed cross-links match their vertices. Select a forest leaf to inspect a competing map.",
      steering: "The four colors distinguish edit directions. The white point is the selected dose. Axis lengths preserve the original PCA projection.",
      flow: "Blue dots are base samples, violet dots are intermediate states, and copper dots are terminal states. The third axis is stage.",
    };
    $("description").textContent = key[mode];
    $("inputs").hidden = mode !== "analogy";


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
    forest:"forest-view-v1.json",steering:"steering-projection-v1.json",flow:"flow-view-v1.json"
  })) fetch(file).then(response => {
    if (!response.ok) throw new Error("trace unavailable");
    return response.json();
  }).then(data => {
    state[key] = data;
    if (key === "forest") state.depth = Math.max(...data.nodes.map(node=>node.depth));
    if (state.mode === key) { paintControls(); render(); }
  }).catch(() => { $("error").textContent = "A measured reasoning trace could not load."; });
})();
