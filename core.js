"use strict";

const PhaseWeave = (() => {
  const currencies = ["EUR", "USD", "JPY"];
  const routes = [[0, 1, 2, 0], [0, 2, 1, 0]];
  const topology = {
    sphere: { alpha: [3, 4, 5, 0, 1, 2], sigma: [5, 3, 4, 1, 2, 0] },
    torus: { alpha: [3, 4, 5, 0, 1, 2, 7, 6], sigma: [6, 3, 4, 1, 2, 7, 5, 0] },
  };

  function cycles(permutation) {
    const visited = new Set();
    const result = [];
    for (let start = 0; start < permutation.length; start += 1) {
      if (visited.has(start)) continue;
      const cycle = [];
      for (let head = start; !visited.has(head); head = permutation[head]) {
        visited.add(head);
        cycle.push(head);
      }
      result.push(cycle);
    }
    return result;
  }

  function cellulation(surface) {
    const { alpha, sigma } = topology[surface];
    const inverse = new Array(sigma.length);
    sigma.forEach((next, dart) => { inverse[next] = dart; });
    const vertices = cycles(sigma);
    const edges = cycles(alpha);
    const faces = cycles(inverse.map((dart) => alpha[dart]));
    return { vertices, edges, faces, genus: (2 - vertices.length + edges.length - faces.length) / 2 };
  }

  function replay(frame, ageLimit, fee) {
    const assets = frame.assets || currencies;
    const byPair = new Map(frame.edges.map((edge) => [edge.from + ":" + edge.to, edge]));
    const scored = routes.map((route) => {
      const names = route.map((index) => assets[index]);
      const legs = names.slice(1).map((asset, index) => byPair.get(names[index] + ":" + asset));
      const fresh = legs.every((leg) => leg && leg.age <= ageLimit);
      const score = fresh ? legs.reduce((sum, leg) => sum + leg.bps - fee, 0) : null;
      let displayCapacity = null;
      if (fresh && legs.every((leg) => Number.isFinite(leg.capacity) && leg.capacity > 0 &&
        Number.isFinite(leg.nativeRate) && leg.nativeRate > 0)) {
        let prefix = 1;
        displayCapacity = Math.min(...legs.map((leg) => {
          const inInitialUnits = leg.capacity / prefix;
          prefix *= leg.nativeRate * Math.exp(-fee / 1e4);
          return inInitialUnits;
        }));
      }
      return { label: names.join(" → "), legs, score, fresh, displayCapacity, initialAsset: names[0] };
    });
    const best = scored.reduce((choice, route, index) =>
      route.fresh && route.score > (choice === -1 ? 0 : scored[choice].score) ? index : choice, -1);
    return { scored, best };
  }

  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

  function tokenize(frame, ageLimit) {
    const assets = frame.assets || currencies;
    const nodes = assets.map((label, index) => {
      const outgoing = frame.edges.filter((edge) => edge.from === label && edge.age <= ageLimit);
      return { label, index, type: "Node", active: true,
        x: [1, mean(outgoing.map((edge) => Math.tanh(edge.bps))), outgoing.length / 2] };
    });
    const edges = frame.edges.map((edge) => ({
      label: edge.from + " → " + edge.to, type: "Edge", active: edge.age <= ageLimit,
      from: assets.indexOf(edge.from), to: assets.indexOf(edge.to),
      x: [-1, Math.tanh(edge.bps), Math.min(edge.age / ageLimit, 1)],
    }));
    return { nodes, edges };
  }

  function softmax(values) {
    const shift = Math.max(...values);
    const exp = values.map((value) => Math.exp(value - shift));
    const total = exp.reduce((sum, value) => sum + value, 0);
    return exp.map((value) => value / total);
  }

  function graphPass(tokens, name) {
    const rows = tokens.nodes.map((node) => {
      const incoming = tokens.edges.filter((edge) => edge.active && edge.to === node.index);
      const sources = [node, ...incoming.map((edge) => tokens.nodes[edge.from])];
      const base = sources.map((source) => source.x[1]);
      if (name === "MPNN") {
        const messages = incoming.map((edge) => Math.tanh(0.75 * tokens.nodes[edge.from].x[1] + 0.35 * edge.x[1]));
        const output = node.x[1] + mean(messages);
        return { label: node.label, sources: incoming.map((edge) => edge.label), weights: [], values: messages, output };
      }
      const scores = base.map((value) => {
        const logit = 0.7 * node.x[1] + 0.3 * value;
        return logit >= 0 ? logit : logit * 0.2;
      });
      const weights = name === "GAT" ? softmax(scores) : base.map(() => 1 / base.length);
      return { label: node.label, sources: sources.map((source) => source.label), weights, values: base, output: dot(weights, base) };
    });
    const descriptions = {
      GCN: "Mean graph convolution over the node and its valid in-neighbors.",
      GAT: "Leaky-ReLU pair scores, neighborhood softmax and weighted values.",
      MPNN: "Directed edge-conditioned messages, mean aggregation and node residual.",
    };
    return { name, rows, description: descriptions[name] };
  }

  function qutrit(angle) {
    const q = 3;
    const phases = [0, 1, 2].map((index) => angle * Math.cos(2 * Math.PI * index / q));
    const probabilities = [0, 1, 2].map((index) => {
      const angles = phases.map((phase, basis) => phase + 2 * Math.PI * index * basis / q);
      const re = mean(angles.map(Math.cos));
      const im = mean(angles.map(Math.sin));
      return re * re + im * im;
    });
    const expectation = probabilities.reduce((sum, value, index) =>
      sum + value * Math.cos(2 * Math.PI * index / q), 0);
    return { angle, probabilities, expectation };
  }

  function attention(tokens, tropical, quantum) {
    const active = tokens.filter((token) => token.active);
    const mapped = active.map((token) => {
      const phase = quantum ? qutrit(Math.PI * token.x[1]) : null;
      const x = [...token.x];
      if (phase) x[1] = phase.expectation;
      return { ...token, x, phase };
    });
    return {
      name: tropical ? "Max-plus TokenGT attention" : "TokenGT attention",
      description: tropical ? "Maximize score + value over each valid key." :
        "Type, scalar feature, and incidence contribute to scores. Softmax mixes valid key values.",
      rows: mapped.map((query) => {
        const scores = mapped.map((key) => {
          const queryEndpoints = query.type === "Node" ? [query.index] : [query.from, query.to];
          const keyEndpoints = key.type === "Node" ? [key.index] : [key.from, key.to];
          const incidence = queryEndpoints.some((index) => keyEndpoints.includes(index)) ? 0.5 : 0;
          return dot(query.x, key.x) / Math.sqrt(3) + incidence;
        });
        const values = mapped.map((token) => token.x[1]);
        const candidates = scores.map((score, index) => score + values[index]);
        const weights = tropical ? [] : softmax(scores);
        return { label: query.label, sources: mapped.map((token) => token.label), scores, weights, values,
          output: tropical ? Math.max(...candidates) : dot(weights, values) };
      }),
      phases: mapped.filter((token) => token.phase).map((token) => ({ label: token.label, ...token.phase })),
    };
  }

  function referencePipeline(frame, limit, model, tropical) {
    const tokens = tokenize(frame, limit);
    const graphMode = model.split(" + ")[0];
    const stages = [];
    let nodes = tokens.nodes;
    if (["GCN", "GAT", "MPNN"].includes(graphMode)) {
      const stage = graphPass(tokens, graphMode);
      stages.push(stage);
      nodes = nodes.map((node, index) => ({ ...node, x: [node.x[0], stage.rows[index].output, node.x[2]] }));
    }
    if (model.includes("TokenGT")) {
      stages.push(attention([...nodes, ...tokens.edges], tropical, model.includes("qutrit")));
    }
    return { tokens, stages };
  }

  return { currencies, cellulation, replay, qutrit, referencePipeline };
})();

if (typeof module !== "undefined") module.exports = PhaseWeave;
