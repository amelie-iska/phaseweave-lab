"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {cellulation, replay, referencePipeline, qutrit} = require("../core");
const GatePublicFeed = require("../gate");
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

test("displayed route capacity converts every leg to the same initial units", () => {
  const routes = replay({assets: ["A", "B", "C"], edges: [
    {from:"A",to:"B",nativeRate:2,capacity:4,bps:10000*Math.log(2),age:2},
    {from:"B",to:"C",nativeRate:3,capacity:7,bps:10000*Math.log(3),age:2},
    {from:"C",to:"A",nativeRate:.2,capacity:6,bps:10000*Math.log(.2),age:2},
  ]}, 250, 0);
  assert.equal(routes.best, 0);
  assert.equal(routes.scored[0].displayCapacity, 1);
  assert.equal(routes.scored[1].displayCapacity, null);
});

test("a live feed keeps each triangle's quotes and units separate", () => {
  const feed = new GatePublicFeed(() => {}, ["XRP", "BTC", "USDT"]);
  const now = Date.now();
  feed.accept("ETH_BTC", .05, .06, 2, 2, now);
  feed.accept("XRP_BTC", .00002, .000022, 100, 120, now);
  feed.accept("BTC_USDT", 94000, 94002, .5, .6, now);
  feed.accept("XRP_USDT", 1.9, 1.91, 100, 120, now);
  const result = feed.snapshot(now);
  assert.equal(result.bookCount, 3);
  assert.equal(result.edges.length, 6);
  assert(result.edges.every((edge) => result.assets.includes(edge.from) && result.assets.includes(edge.to)));
  const margin = replay(result, 250, .1).scored[0].score;
  assert(Math.abs(margin - (1e4 * Math.log(.00002 * 94000 / 1.91) - .3)) < 1e-8);
});
