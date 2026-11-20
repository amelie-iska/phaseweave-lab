"use strict";

(() => {
  const DATA_SHA256 = "20d8a6c76627c97fb3827235d4d25477d664cc0fb7d7ce351dc2e20ec95260b3";
  const ROLES = {country: "copper", capital: "blue", currency: "jade", issuer: "violet"};
  const PAINT = {copper: "--copper", jade: "--jade", blue: "--atlas-blue", violet: "--atlas-violet",
    text: "--text", muted: "--muted", line: "--line"};
  const element = id => document.getElementById(id);
  const canvas = element("atlas-canvas");
  const camera = element("atlas-camera");
  const find = element("atlas-query");
  const results = element("atlas-results");
  const chosenLayout = element("atlas-layout-choice");
  const path = element("atlas-path");
  const themeButtons = [...document.querySelectorAll("button[data-atlas-theme]")];
  const normalize = value => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const displayRole = role => role[0].toUpperCase() + role.slice(1);
  const isPoint = point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
  let fixture, nodes, adjacent, ownerNodes, draw, palette, selected;
  let shown = [], matching = new Set();

  function link(label, address) {
    const anchor = document.createElement("a");
    anchor.textContent = label;
    anchor.href = address;
    return anchor;
  }

  function theme(value) {
    document.documentElement.dataset.theme = value;
    for (const button of themeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.atlasTheme === value));
    }
    const style = getComputedStyle(document.documentElement);
    palette = Object.fromEntries(Object.entries(PAINT).map(([key, css]) =>
      [key, style.getPropertyValue(css).trim()]));
    renderMap();
  }

  function pathEdges(owner) {
    const roles = ownerNodes.get(owner);
    const capital = roles.get("capital");
    const country = roles.get("country");
    const currency = roles.get("currency");
    const issuer = roles.get("issuer");
    return [
      {from: capital, to: country, edge: adjacent.get(country).find(edge =>
        edge.kind === "P36" && edge.target === capital), reversed: true},
      {from: country, to: currency, edge: adjacent.get(country).find(edge =>
        edge.kind === "P38" && edge.target === currency)},
      {from: currency, to: issuer, edge: adjacent.get(currency).find(edge =>
        edge.kind === "P562" && edge.target === issuer)},
    ];
  }

  function drawSegment(from, to) {
    return [from, to.map((coordinate, index) => coordinate + (from[index] - coordinate) * .15)];
  }

  function renderMap() {
    if (!draw || !fixture || !selected) return;
    const coordinate = chosenLayout.value === "projection" ? "hrr_projected_point" : "point";
    const active = new Set(adjacent.get(selected.id));
    if (path.open) {
      for (const step of pathEdges(selected.owner)) active.add(step.edge);
    }
    const highlighted = new Set([...active].flatMap(edge => [edge.source, edge.target]));
    const points = fixture.nodes.map(node => {
      const chosen = node === selected;
      const neighbor = highlighted.has(node.id);
      return {id: node.id, point: node[coordinate], color: chosen ? "text" : ROLES[node.role],
        radius: chosen ? 7 : neighbor ? 5 : matching.has(node.id) ? 4 : 3.3,
        label: chosen ? (canvas.clientWidth < 440 ? node.id : node.label) : undefined,
        alpha: chosen || neighbor ? 1 : matching.has(node.id) ? .82 : .38};
    });
    const lines = fixture.edges.map(edge => {
      const on = active.has(edge);
      const from = nodes.get(edge.source), to = nodes.get(edge.target);
      return {coords: drawSegment(from[coordinate], to[coordinate]), arrow: true,
        color: on ? ROLES[from.role] : "line", alpha: on ? .92 : .34, width: on ? 2 : 1};
    });
    const projection = coordinate === "hrr_projected_point";
    draw({points, lines, minExtent: projection ? .28 : 8,
      axes: projection ? ["PC 1", "PC 2", "PC 3"] : ["Role steps", "Owner row", "Layer"]}, palette);
  }

  function property(edge) {
    return `${fixture.properties[edge.kind]} (${edge.kind})`;
  }

  function renderDetail() {
    element("atlas-entity-title").textContent = selected.label;
    const role = element("atlas-entity-role");
    role.className = `atlas-entity-role atlas-${selected.role}`;
    role.textContent = displayRole(selected.role);
    const wiki = element("atlas-wiki-link");
    wiki.hidden = false;
    wiki.textContent = `${selected.id} on Wikidata`;
    wiki.href = selected.url;
    element("atlas-neighbors").replaceChildren(...adjacent.get(selected.id).map(edge => {
      const inbound = edge.target === selected.id;
      const other = nodes.get(inbound ? edge.source : edge.target);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = other.label;
      button.addEventListener("click", () => {
        select(other.id);
        const next = element("atlas-neighbors").querySelector("button");
        if (next) next.focus();
      });
      const caption = document.createElement("p");
      caption.textContent = `${inbound ? "Incoming" : "Outgoing"} · ${property(edge)}`;
      item.append(button, caption, link("Pinned statement revision", edge.source_revision_url));
      return item;
    }));
    element("atlas-path-steps").replaceChildren(...pathEdges(selected.owner).map(step => {
      const item = document.createElement("li");
      const caption = document.createElement("span");
      caption.textContent = `${nodes.get(step.from).label} → ${nodes.get(step.to).label} · `;
      const label = step.reversed ? `Reverse ${property(step.edge)}` : property(step.edge);
      item.append(caption, link(label, step.edge.source_revision_url));
      return item;
    }));
    path.hidden = false;
  }

  function markCurrent() {
    const buttons = [...results.querySelectorAll("button[data-entity]")];
    const current = buttons.find(button => button.dataset.entity === selected.id);
    const focusable = buttons.includes(document.activeElement) ? document.activeElement : current || buttons[0];
    for (const button of buttons) {
      button.tabIndex = button === focusable ? 0 : -1;
      if (button.dataset.entity === selected.id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  function select(id, share = true) {
    const node = nodes.get(id);
    if (!node) return;
    selected = node;
    if (share) history.replaceState(null, "", `#${id}`);
    renderDetail();
    markCurrent();
    renderMap();
  }

  function search() {
    const query = normalize(find.value.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    const score = node => {
      const label = normalize(node.label);
      if (node.id.toLowerCase() === query || label === query) return 0;
      if (label.startsWith(query)) return 1;
      return 2;
    };
    shown = fixture.nodes.filter(node =>
      terms.every(term => normalize(`${node.label} ${node.id} ${node.role}`).includes(term)));
    shown.sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    matching = terms.length ? new Set(shown.map(node => node.id)) : new Set();
    const items = shown.map(node => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const label = document.createElement("span");
      const identifier = document.createElement("small");
      button.type = "button";
      button.dataset.entity = node.id;
      label.textContent = node.label;
      identifier.textContent = node.id;
      button.append(label, identifier);
      button.addEventListener("click", () => select(node.id));
      item.append(button);
      return item;
    });
    results.replaceChildren(...items);
    element("atlas-result-status").textContent = shown.length === 0 ? "No matching entities" :
      `${shown.length} ${shown.length === 1 ? "entity" : "entities"}`;
    markCurrent();
    renderMap();
  }

  function layout() {
    const details = fixture.projection;
    element("atlas-layout-fidelity").textContent = chosenLayout.value === "relations"
      ? "Within each owner component, the layout preserves graph hop distances exactly."
      : `PCA fitted on ${details.fit_nodes} training entities. Three axes retain ${(details.pca_training_explained_variance * 100).toFixed(2)}% of variance. Hop correlation ${details.hrr_projected_hop_pearson.toFixed(3)}.`;
    renderMap();
  }

  function keyboard() {
    find.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" && shown.length) {
        event.preventDefault();
        results.querySelector("button").focus();
      }
      if (event.key === "Escape" && find.value) {
        find.value = "";
        search();
      }
    });
    results.addEventListener("keydown", event => {
      const buttons = [...results.querySelectorAll("button")];
      const index = buttons.indexOf(event.target);
      if (index < 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = index + (event.key === "ArrowDown" ? 1 : -1);
        if (next < 0) find.focus();
        else buttons[Math.min(next, buttons.length - 1)].focus();
      } else if (event.key === "Escape") {
        find.focus();
      }
    });
    results.addEventListener("focusin", markCurrent);
    canvas.addEventListener("keydown", event => {
      const movement = {ArrowLeft: ["yaw", -8], ArrowRight: ["yaw", 8],
        ArrowUp: ["pitch", 8], ArrowDown: ["pitch", -8],
        "+": ["zoom", .1], "=": ["zoom", .1], "-": ["zoom", -.1]}[event.key];
      if (!movement && event.key !== "Home") return;
      event.preventDefault();
      if (!movement) {
        camera.querySelector("button").click();
        return;
      }
      const [axis, change] = movement;
      const input = camera.querySelector(`[name="${axis}"]`);
      input.value = Math.max(+input.min, Math.min(+input.max, +input.value + change));
      input.dispatchEvent(new Event("input", {bubbles: true}));
    });
  }

  async function openFixture() {
    const response = await fetch("kg-atlas-calibration-v1.json");
    if (!response.ok) throw new Error("The fixture could not be loaded.");
    const bytes = await response.arrayBuffer();
    if (!globalThis.crypto?.subtle) throw new Error("Open the atlas via HTTPS or localhost to verify the snapshot.");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (checksum !== DATA_SHA256) throw new Error("The snapshot hash differs from the frozen atlas.");
    const record = JSON.parse(new TextDecoder().decode(bytes));
    if (record.format !== "phaseweave.kg_atlas_calibration.v1" || record.license !== "CC0-1.0" ||
        record.nodes.length !== 64 || record.edges.length !== 48 ||
        !record.nodes.every(node => /^Q[1-9][0-9]*$/.test(node.id) &&
          Object.hasOwn(ROLES, node.role) && isPoint(node.point) && isPoint(node.hrr_projected_point))) {
      throw new Error("The atlas graph schema differs from the frozen fixture.");
    }
    return record;
  }

  async function start() {
    let initial = "dark";
    try {
      if (localStorage.getItem("phaseweave-theme") === "light") initial = "light";
    } catch {}
    theme(initial);
    for (const button of themeButtons) {
      button.addEventListener("click", () => {
        const value = button.dataset.atlasTheme;
        theme(value);
        try { localStorage.setItem("phaseweave-theme", value); } catch {}
      });
    }
    try {
      fixture = await openFixture();
      nodes = new Map(fixture.nodes.map(node => [node.id, node]));
      adjacent = new Map(fixture.nodes.map(node => [node.id, []]));
      ownerNodes = new Map();
      for (const node of fixture.nodes) {
        if (!ownerNodes.has(node.owner)) ownerNodes.set(node.owner, new Map());
        ownerNodes.get(node.owner).set(node.role, node.id);
      }
      for (const edge of fixture.edges) {
        adjacent.get(edge.source).push(edge);
        adjacent.get(edge.target).push(edge);
      }
      draw = Reasoning3D.bind(canvas, camera, renderMap, select);
      new ResizeObserver(renderMap).observe(canvas);
      find.disabled = false;
      chosenLayout.disabled = false;
      element("atlas-totals").textContent = `${nodes.size} entities · ${fixture.edges.length} statements · ${ownerNodes.size} components`;
      const snapshot = element("atlas-snapshot");
      snapshot.dateTime = fixture.retrieved_utc;
      snapshot.textContent = new Date(fixture.retrieved_utc).toISOString().replace("T", " ").replace(".000Z", " UTC");
      find.addEventListener("input", search);
      element("atlas-search-form").addEventListener("submit", event => {
        event.preventDefault();
        if (shown.length) select(shown[0].id);
      });
      chosenLayout.addEventListener("change", layout);
      path.addEventListener("toggle", renderMap);
      window.addEventListener("hashchange", () => select(location.hash.slice(1), false));
      keyboard();
      select(nodes.has(location.hash.slice(1)) ? location.hash.slice(1) : "Q189", false);
      search();
      layout();
    } catch (error) {
      element("atlas-totals").textContent = "Atlas unavailable";
      const detail = element("atlas-data-error");
      detail.hidden = false;
      detail.textContent = error.message;
    }
  }

  start();
})();
