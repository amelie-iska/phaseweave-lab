"use strict";

const ReasoningParallel = (() => {
  const defaultExample = Object.freeze({
    id: "validation-v1",
    label: "September validation · four trained roots",
    file: "forest-view-v1.json",
    sha256: "1443c77e30aeb4d0aea32e3fcaafc813e35514faa685c1f28f089425d7312fad",
    provenance: "First eligible September validation context from the frozen FX corpus.",
  });
  const manifestFile = "forest-examples-v1.json";
  const treeLabel = tree => tree < 0 ? "Consensus" : `Tree ${tree + 1}`;
  const metricAxes = ["Forward Δ", "Reverse Δ", "Log move"];
  const layoutAxes = ["Tree lane", "Earlier layers ↑", "Display offset"];
  const purpose = layout => layout === "parallel"
    ? "Every root has its own lane. Layers progress downward, and horizontal spacing separates sibling states. Layout distances are display coordinates."
    : "Positions show the original standardized forward margin change, reverse margin change, and log move estimate.";

  async function loadJSON(file, sha256) {
    const response = await fetch(file);
    if (!response.ok) throw new Error("Measured forest asset unavailable");
    if (!sha256) return response.json();
    const bytes = await response.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2,"0")).join("");
    if (hex !== sha256) throw new Error("Measured forest trace checksum differs");
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function loadExamples() {
    try {
      const index = await loadJSON(manifestFile);
      if (index.version !== 1 || !Array.isArray(index.examples)) return [defaultExample];
      const seen = new Set([defaultExample.id]);
      const other = index.examples.filter(item => {
        if (!item || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) ||
            !/^forest-view-[a-z0-9-]+\.json$/.test(item.file) ||
            !/^[0-9a-f]{64}$/.test(item.sha256) ||
            typeof item.label !== "string" || !item.label.trim() ||
            typeof item.provenance !== "string" || !item.provenance.trim() || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      return [defaultExample, ...other];
    } catch {
      return [defaultExample];
    }
  }

  function loadTrace(example) {
    return loadJSON(example.file,example.sha256).then(trace => {
      if (!trace || !Array.isArray(trace.nodes) || !trace.nodes.length ||
          !Array.isArray(trace.edges) || !trace.local_complexes ||
          !trace.nodes.every(node => node && Number.isInteger(node.id) && Number.isInteger(node.tree) &&
            Number.isInteger(node.depth) && node.depth >= 0 && Array.isArray(node.point) &&
            node.point.length === 3 && node.point.every(Number.isFinite)) ||
          !trace.nodes.some(node => node.depth === 0 && node.tree >= 0)) {
        throw new Error("Invalid measured forest trace");
      }
      const ids = new Set(trace.nodes.map(node => node.id));
      if (ids.size !== trace.nodes.length || !trace.edges.every(edge => edge &&
          ids.has(edge.source) && ids.has(edge.target) && typeof edge.kind === "string") ||
          !Object.values(trace.local_complexes).every(complex => complex && Array.isArray(complex.simplices) &&
            complex.simplices.every(simplex => simplex && Number.isFinite(simplex.birth) && simplex.birth >= 0 &&
              Array.isArray(simplex.vertices) && simplex.vertices.length >= 1 && simplex.vertices.length <= 3 &&
              simplex.vertices.every(id => ids.has(id))))) {
        throw new Error("Invalid measured forest connectivity");
      }
      return trace;
    });
  }

  function profile(trace) {
    const trees = [...new Set(trace.nodes.filter(node => node.tree >= 0).map(node => node.tree))].sort((a,b) => a-b);
    let radius = 2.5;
    for (const complex of Object.values(trace.local_complexes)) {
      for (const simplex of complex.simplices) radius = Math.max(radius, simplex.birth);
    }
    const depth = Math.max(...trace.nodes.map(node => node.depth));
    const widths = Array(depth + 1).fill(0);
    trace.nodes.forEach(node => { widths[node.depth]++; });
    return {trees, depth, widths, radius: Math.ceil(radius * 4) / 4};
  }

  function visibleNodes(trace, state) {
    return trace.nodes.filter(node => node.depth <= state.depth &&
      (state.forestTree < 0 || node.tree === state.forestTree || node.tree < 0));
  }

  function parallelCoordinates(trace, selectedTree) {
    const inFocus = trace.nodes.filter(node => selectedTree < 0 || node.tree === selectedTree || node.tree < 0);
    const trees = [...new Set(inFocus.filter(node => node.tree >= 0).map(node => node.tree))].sort((a,b) => a-b);
    const lane = new Map(trees.map((id,index) => [id,index]));
    const group = new Map();
    const depth = Math.max(...inFocus.map(node => node.depth));
    const width = trees.length > 1 ? 3.9 / trees.length : 2.6;
    for (const node of inFocus) {
      const key = `${node.tree}:${node.depth}`;
      if (!group.has(key)) group.set(key, []);
      group.get(key).push(node);
    }
    const order = new Map();
    const parent = new Map(trace.edges.filter(edge => !edge.kind.includes("consensus"))
      .map(edge => [edge.target, edge.source]));
    const points = new Map();
    for (const siblings of [...group.values()].sort((a,b) => a[0].depth-b[0].depth)) {
      siblings.sort((a,b) => (order.get(parent.get(a.id)) ?? 0) - (order.get(parent.get(b.id)) ?? 0) || a.id-b.id);
      siblings.forEach((node,index) => {
        order.set(node.id,index);
        const spread = siblings.length > 1 ? index / (siblings.length-1) - .5 : 0;
        const center = node.tree < 0 ? 0 : (lane.get(node.tree) - (trees.length-1)/2) * width;
        const layer = depth ? 1.45 - 2.9 * node.depth / depth : 0;
        points.set(node.id, [center + spread * width * .85, layer, spread * .18]);
      });
    }
    return points;
  }

  function scene(trace, state, renderer) {
    const shown = visibleNodes(trace, state);
    const parallel = state.forestLayout === "parallel";
    const pivot = shown.find(node => node.id === state.node) || shown[0];
    const coords = parallel ? parallelCoordinates(trace,state.forestTree) : new Map(shown.map(node => [node.id,node.point]));
    const plotted = new Map(shown.map(node => [node.id,{...node,point:coords.get(node.id)}]));
    const edges = trace.edges.filter(edge => edge.kind === "expansion" ? state.expansion :
      edge.kind.includes("consensus") ? state.consensus : state.correction);
    const result = renderer.forestScene([...plotted.values()],edges,state.depth,0,pivot.id,parallel ? layoutAxes : metricAxes);
    if (parallel) {
      result.minExtent = 1.9;
      const showRootLabels = shown.filter(node => node.depth === 0).length <= 8;
      result.points.forEach(point => {
        const node = plotted.get(point.id);
        if (node.depth === 0 && (showRootLabels || node.id === pivot.id)) point.label = `T${node.tree + 1}`;
        if (node.tree < 0) point.label = treeLabel(node.tree);
        if (node.id === pivot.id) point.label = (point.label ? point.label + " · " : "") + `#${node.id}`;
      });
    }
    const counts = [0,0,0];
    const complex = trace.local_complexes[pivot.id];
    for (const simplex of complex?.simplices || []) {
      if (simplex.birth > state.radius || !simplex.vertices.every(id => plotted.has(id))) continue;
      const vertices = simplex.vertices.map(id => coords.get(id));
      counts[vertices.length-1]++;
      if (vertices.length === 2) result.lines.push({coords:vertices,color:"violet",dash:[2,3],alpha:.75});
      if (vertices.length === 3) result.faces.push({coords:vertices,color:"violet",alpha:.15});
    }
    return {result,pivot,shown,counts};
  }

  return {defaultExample, loadExamples, loadTrace, profile, treeLabel, purpose, visibleNodes, scene};
})();
