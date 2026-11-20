"use strict";

const LatentReasoning = (() => {
  const add = (a, b) => a.map((value, index) => value + b[index]);
  const sub = (a, b) => a.map((value, index) => value - b[index]);
  const scale = (a, factor) => a.map((value) => value * factor);
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const norm = (a) => Math.hypot(...a);
  const normalize = (a, fallback) => norm(a) > 1e-9 ? scale(a, 1 / norm(a)) : fallback;
  const mean = (points) => scale(points.reduce(add, [0, 0]), 1 / points.length);

  function marketState(frame) {
    const edge = (from, to) => frame.edges.find((row) => row.from === from && row.to === to).bps;
    const clockwise = edge("EUR", "USD") + edge("USD", "JPY") + edge("JPY", "EUR");
    const reverse = edge("EUR", "JPY") + edge("JPY", "USD") + edge("USD", "EUR");
    const skew = (clockwise - reverse) / 2;
    // The sum of both oriented triangles is minus the sum of all three spreads.
    const spread = -(clockwise + reverse) / 3;
    const age = Math.max(...frame.edges.map((row) => row.age));
    const friction = Math.log1p(Math.max(0, spread)) + 0.14 * Math.log1p(age / 250);
    return {
      point: [2.15 * Math.tanh(skew / 1.85), 2.1 * Math.tanh(friction - 0.85)],
      skew, spread, age, clockwise, reverse,
    };
  }

  function contrast(samples, key) {
    const ordered = [...samples].sort((a, b) => a[key] - b[key]);
    const count = Math.max(1, Math.floor(ordered.length / 4));
    return sub(mean(ordered.slice(-count).map((r) => r.point)), mean(ordered.slice(0, count).map((r) => r.point)));
  }

  function conceptBasis(samples) {
    const skew = normalize(contrast(samples, "skew"), [1, 0]);
    const difference = contrast(samples, "spread");
    const friction = normalize(sub(difference, scale(skew, dot(difference, skew))), [-skew[1], skew[0]]);
    return [skew, friction];
  }

  function analogy(target, before, after, strength) {
    const displacement = sub(after, before);
    return { displacement, prediction: add(target, scale(displacement, strength)) };
  }

  function density(point, center, variance) {
    const delta = sub(point, center);
    return Math.exp(-dot(delta, delta) / (2 * variance)) / (2 * Math.PI * variance);
  }

  function reward(point, components) {
    return components.reduce((value, part) => value + part.mass * density(point, part.center, part.variance), 0);
  }

  function forest(origin, components, diversification, horizon) {
    return components.flatMap((component, index) => {
      const tangent = normalize(sub(component.center, origin), [1, 0]);
      const normal = [-tangent[1], tangent[0]];
      const branches = horizon >= 3 ? [-1, 1] : [0];
      return branches.map((branch) => {
        const points = [origin];
        for (let level = 1; level <= horizon; level++) {
          const current = points.at(-1);
          const centerStep = scale(sub(component.center, current), 0.35);
          const fork = level >= 3 ? branch * diversification * Math.sin((level - 2) * 0.77) * 0.19 : 0;
          const offset = scale(normal, (index - 1) * diversification * Math.sin(level * 0.76) * 0.22 + fork);
          points.push(add(current, add(centerStep, offset)));
        }
        return { points, reward: reward(points.at(-1), components), index, branch };
      });
    });
  }

  function rng(seed) {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return (value + 0.5) / 4294967296;
    };
  }

  function normal(random) {
    const radius = Math.sqrt(-2 * Math.log(random()));
    const angle = 2 * Math.PI * random();
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  }

  function pick(weights, random) {
    const threshold = random() * weights.reduce((sum, weight) => sum + weight, 0);
    let total = 0;
    return weights.findIndex((weight) => (total += weight) >= threshold);
  }

  function bridge(origin, components) {
    const a = 0.54;
    const noise = 0.11;
    const total = components.reduce((sum, part) => sum + part.mass, 0);
    const parts = components.map((part) => ({
      ...part, weight: part.mass / total,
      midpoint: add(scale(part.center, a), scale(origin, 1 - a)),
      intermediateVariance: a * a * part.variance + noise,
    }));
    const posterior = (z, part) => {
      const gain = a * part.variance / part.intermediateVariance;
      return {
        center: add(part.center, scale(sub(z, part.midpoint), gain)),
        variance: part.variance - gain * a * part.variance,
      };
    };
    const midpointWeights = (z) => parts.map((part) =>
      part.weight * density(z, part.midpoint, part.intermediateVariance));

    function sample(random) {
      const part = parts[pick(parts.map((item) => item.weight), random)];
      const z = add(part.midpoint, scale(normal(random), Math.sqrt(part.intermediateVariance)));
      const weights = midpointWeights(z);
      const selected = pick(weights, random);
      const conditional = posterior(z, parts[selected]);
      const x = add(conditional.center, scale(normal(random), Math.sqrt(conditional.variance)));
      const forward = parts.reduce((sum, item, index) => {
        const conditioned = posterior(z, item);
        return sum + weights[index] * density(x, conditioned.center, conditioned.variance);
      }, 0);
      const backward = density(z, add(scale(x, a), scale(origin, 1 - a)), noise);
      const residual = Math.log(total * forward) - Math.log(reward(x, components) * backward);
      return { z, x, residual, component: selected };
    }

    return { sample, total };
  }

  return { add, sub, scale, norm, dot, mean, marketState, conceptBasis, analogy, forest, reward, rng, bridge };
})();

if (typeof module !== "undefined") module.exports = LatentReasoning;
