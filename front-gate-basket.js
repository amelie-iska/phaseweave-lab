"use strict";

const GateBasket = (() => {
  function scan(feed, ageLimit, fee, captured = Date.now()) {
    const rows = [], unavailable = [];
    for (const [id, name] of GateSpotSources.entries()) {
      const sample = GateSpotSources.snapshot(feed, ageLimit, id, captured);
      if (!sample) {
        unavailable.push(name.replace(/^Live Gate · /, ""));
        continue;
      }
      const {frame} = sample;
      const [base, btc, usdt] = frame.assets;
      // Every route starts and ends in USDT, including the depth denomination.
      const view = {...frame, assets: [usdt, base, btc]};
      for (const route of PhaseWeave.replay(view, ageLimit, fee).scored) {
        if (!route.fresh || !Number.isFinite(route.score)) continue;
        rows.push({name: route.label, score: route.score, capacity: route.displayCapacity,
          age: Math.max(...route.legs.map(leg => leg.age)),
          oldest: Math.min(...route.legs.map(leg => leg.updated))});
      }
    }
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return {rows, unavailable, captured, source: feed?.mode};
  }

  function bind(root, getFeed) {
    if (!root) return;
    const fee = root.querySelector("#gate-basket-fee");
    const freshness = root.querySelector("#gate-basket-age");
    const clock = root.querySelector("time");
    const state = root.querySelector("[data-basket-state]");
    const table = root.querySelector("tbody");
    const formatTime = stamp => new Date(stamp).toISOString().replace("T", " ").replace("Z", " UTC");
    let interval;
    function render() {
      const value = fee.valueAsNumber;
      if (!Number.isFinite(value) || !fee.validity.valid) {
        state.textContent = "Enter a per-leg fee from 0 to 100 log bps.";
        return;
      }
      const {rows, unavailable, captured, source} = scan(getFeed(), Number(freshness.value), value);
      clock.dateTime = new Date(captured).toISOString();
      clock.textContent = formatTime(captured);
      state.textContent = `${source || "Gate connecting"} · ${rows.length}/10 eligible directions` +
        (unavailable.length ? " · awaiting fresh books for " + unavailable.join(", ") : "");
      table.replaceChildren(...rows.map((row, i) => {
        const tr = document.createElement("tr");
        const cells = [i + 1, row.name, row.score.toFixed(4),
          row.capacity === null ? "—" : row.capacity.toFixed(2),
          Math.round(row.age) + " ms", formatTime(row.oldest)];
        for (const [j, value] of cells.entries()) {
          const cell = document.createElement(j === 1 ? "th" : "td");
          if (j === 1) cell.scope = "row";
          cell.textContent = value;
          tr.append(cell);
        }
        return tr;
      }));
      if (!rows.length) {
        const row = table.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = "No complete price triangle within the selected quote age.";
      }
    }
    function start() {
      clearInterval(interval);
      render();
      interval = setInterval(() => { if (!document.hidden) render(); }, 1200);
    }
    for (const input of [fee, freshness]) input.addEventListener("input", render);
    window.addEventListener("pagehide", () => clearInterval(interval));
    window.addEventListener("pageshow", start);
    start();
  }

  return {bind, scan};
})();
