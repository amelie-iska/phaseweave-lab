"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const examples = require("../replay.json");
const walk = require("../density");

const options = { mix: .63, phase: 1, ageLimit: 250 };
const near = (actual, expected) => assert(Math.abs(actual - expected) < 2e-13, `${actual} differs from ${expected}`);
const vectorNear = (actual, expected) => actual.forEach((value, index) => near(value, expected[index]));

test("cyclic link is unitary and has determinant one across phase scales", () => {
  for (const angle of [0, .4, -2, 3]) {
    const link = walk.linkUnitary(angle);
    walk.compose(link, walk.adjoint(link)).forEach((row, i) => row.forEach((value, j) => vectorNear(value, i === j ? [1, 0] : [0, 0])));
    const [a, b, c] = [link[1][0], link[2][1], link[0][2]];
    const multiply = ([re, im], [real, imag]) => [re * real - im * imag, re * imag + im * real];
    vectorNear(multiply(multiply(a, b), c), [1, 0]);
  }
  assert.deepEqual(walk.act(walk.linkUnitary(0), [[1, 0], [0, 0], [0, 0]]), [[0, 0], [1, 0], [0, 0]]);
});

test("observed quote replay conserves total probability with signed edge continuity", () => {
  for (const example of examples) {
    const steps = walk.replay(example.frames, 0, options);
    assert.equal(steps.length, example.frames.length);
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const densities = walk.density(step.state);
      near(walk.total(densities), 1);
      if (index === 0) continue;
      const incoming = [0, 0, 0];
      step.links.forEach(({source, target}, link) => {
        incoming[source] -= step.flux[link];
        incoming[target] += step.flux[link];
      });
      vectorNear(walk.density(steps[index - 1].state).map((value, site) => value + incoming[site]), densities);
    }
  }
});

test("site-local SU(3) changes color components while preserving trajectories and Wilson trace", () => {
  for (const example of examples) {
    const steps = walk.replay(example.frames, 0, options);
    for (let index = 1; index < steps.length; index += 1) {
      const step = steps[index];
      const rotated = walk.changeBasis(steps[index - 1].state, step.links);
      const expected = walk.changeBasis(step.state, step.links);
      const updated = walk.sweep(rotated.state, rotated.links);
      updated.state.forEach((site, i) => site.forEach((component, j) => vectorNear(component, expected.state[i][j])));
      vectorNear(updated.flux, step.flux);
      vectorNear(walk.density(updated.state), walk.density(step.state));
      const wilson = walk.wilson(step.links);
      if (wilson) vectorNear(walk.wilson(rotated.links), wilson);
      else assert.equal(walk.wilson(rotated.links), null);
    }
  }
  const initial = walk.initialState(0);
  assert.notDeepEqual(walk.changeBasis(initial, []).state[0].map(walk.squared), initial[0].map(walk.squared));
});

test("unavailable links close the gate and leave the Wilson trace undefined", () => {
  const stale = examples.find((example) => example.id === "closed").frames[0];
  const links = walk.marketLinks(stale, options);
  assert(links.every((link) => !link.active));
  assert.equal(walk.wilson(links), null);
  const initial = walk.initialState(1);
  assert.deepEqual(walk.sweep(initial, links), {state: initial, flux: [0, 0, 0]});
});
