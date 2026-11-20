"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {cellulation, replay, referencePipeline, qutrit} = require("../core");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "replay.json")));

test("the marked surface graphs have disk faces and the stated Euler characteristic", () => {
  for (const [kind, genus, faces] of [["torus", 1, 1], ["sphere", 0, 2]]) {
    const cell = cellulation(kind);
    assert.equal(cell.genus, genus);
    assert.equal(cell.faces.length, faces);
    assert.equal(cell.faces.flat().length, 2 * cell.edges.length);
  }
});

test("the browser verifier reproduces the Python archive result", () => {
  const observed = replay(data[0].frames[0], 250, .1);
  assert(Math.abs(observed.scored[1].score + .7458566558) < 2e-8);
  assert.equal(replay(data[2].frames[0], 250, .1).best, -1);
});

test("all reference operators are finite on 93 observed windows", () => {
  const models = ["GCN","GAT","MPNN","TokenGT","TokenGT + cyclic qutrit",
    "GAT + TokenGT","GCN + TokenGT","MPNN + TokenGT"];
  assert.equal(data.length, 3);
  for (const scenario of data) {
    assert.equal(scenario.frames.length, 31);
    for (const frame of scenario.frames) {
      for (const model of models) {
        for (const tropical of [false, true]) {
          const trace = referencePipeline(frame, 250, model, tropical);
          assert(trace.stages.every((stage) => stage.rows.every((row) => Number.isFinite(row.output))));
        }
      }
    }
  }
});

test("cyclic qutrit probabilities sum to one", () => {
  for (const angle of [-3, .3, 0, 3]) {
    const norm = qutrit(angle).probabilities.reduce((a, b) => a + b);
    assert(Math.abs(norm - 1) < 1e-12);
  }
});
