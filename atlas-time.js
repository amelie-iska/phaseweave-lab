"use strict";

(() => {
  const BYTES_HASH = "c0e5be7db12df3664faa41f19a6f28b5a983e0227f0746e1b50ab314148a20e3";
  const $ = name => document.getElementById("atlas-time-" + name);
  const params = new URLSearchParams(location.search);
  const frameButtons = [...document.querySelectorAll("[data-atlas-time-frame]")];
  const themeButtons = [...document.querySelectorAll("[data-atlas-time-theme]")];
  const camera = $("camera");
  const canvas = $("canvas");
  const list = $("results");
  const sliders = Object.fromEntries([...camera.querySelectorAll("input")].map(input => [input.name,input]));
  const headings = ["Projection 1","Projection 2","Projection 3"];
  const arrow = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
  const viewNotes = {
    cloud: "The same three projection axes are used for both releases. The highlighted lines are records incident to the selected LEI.",
    relations: "Only the selected LEI and its reported neighbors are shown in this edition. Arrows follow the relationship's published direction.",
    geometry: "Six nearest neighbors are ranked by Euclidean distance in the original 128 dimensions. Dashed lines represent vector proximity.",
  };
  const state = {bundle:null, editions:[], index:0, selected:null, view:"cloud",
                 query:"", timer:null, pan:[0,0,0], union:[], extent:.25};
  const draw = Reasoning3D.bind(canvas,camera,paintCloud,select);
  const clock = value => value.replace("T"," ").replace("+00:00"," UTC");
  const short = value => value.slice(11,16) + " UTC";
  const degree = node => node.in_records + node.out_records;
  const descriptions = {
    IS_DIRECTLY_CONSOLIDATED_BY:"Directly consolidated by",
    IS_ULTIMATELY_CONSOLIDATED_BY:"Ultimately consolidated by",
    "IS_FUND-MANAGED_BY":"Fund managed by",
    IS_FEEDER_TO:"Feeder to",
    IS_SUBFUND_OF:"Subfund of",
    IS_INTERNATIONAL_BRANCH_OF:"International branch of",
  };

  function entry(tag,text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function membership(id) {
    const before = state.editions[0].nodes.has(id), after = state.editions[1].nodes.has(id);
    if (before && after) return {name:"Both editions",short:"Both",color:"blue"};
    return before ? {name:"08:00 edition only",short:"08:00",color:"jade"} :
      {name:"16:00 edition only",short:"16:00",color:"copper"};
  }

  const relationshipKey = edge => [edge.source,edge.relation,edge.target].join("|");

  async function load() {
    const response = await fetch("atlas-time-v1.json");
    if (!response.ok) throw new Error("Atlas data unavailable");
    const bytes = await response.arrayBuffer();
    const encoded = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const hex = Array.from(encoded, byte => byte.toString(16).padStart(2,"0")).join("");
    if (hex !== BYTES_HASH) throw new Error("Atlas checksum mismatch");
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.schema !== "phaseweave.gleif-time-atlas.v1" || data.editions.length !== 2 ||
        !data.editions.every(edition => Date.parse(edition.released_utc) <= Date.parse(edition.observed_utc))) {
      throw new Error("Atlas clock or schema mismatch");
    }
    state.bundle = data;
    state.editions = data.editions.map(edition => ({
      ...edition,
      nodes: new Map(edition.nodes.map(node => [node.id,node])),
      ids: edition.nodes.map(node => node.id),
      edgeIndex: new Map(edition.edges.map(edge => [relationshipKey(edge),edge])),
      adjacent: new Map(edition.nodes.map(node => [node.id,[]])),
    }));
    for (const edition of state.editions) {
      for (const edge of edition.edges) {
        edition.adjacent.get(edge.source).push(edge);
        edition.adjacent.get(edge.target).push(edge);
      }
    }
    const shared = Object.keys(data.shared_nodes_l2).sort((a,b) =>
      degree(state.editions[0].nodes.get(b))-degree(state.editions[0].nodes.get(a)) || a.localeCompare(b));
    state.union = [...new Set([...state.editions.flatMap(edition => edition.ids)].sort())];
    state.selected = state.union.includes(params.get("lei")) ? params.get("lei") : shared[0];
    state.index = params.get("release") === state.editions[1].id ? 1 : 0;
    [$("frame"),$("play"),$("query"),$("view"),...frameButtons].forEach(item => { item.disabled = false; });
    paint();
  }

  function palette() {
    const styles = getComputedStyle(document.documentElement);
    const names = ["line","muted","text","jade","copper","blue","violet"];
    return Object.fromEntries(names.map(name => [name,styles.getPropertyValue(
      (name === "blue" || name === "violet" ? "--atlas-" : "--") + name).trim()]));
  }

  function current() {
    return state.editions[state.index];
  }

  function paintCloud() {
    if (!state.bundle) return;
    const edition = current(), selected = edition.nodes.get(state.selected);
    const edges = selected ? edition.adjacent.get(selected.id) : [];
    const directlyLinked = new Set(edges.flatMap(edge => [edge.source,edge.target]));
    const closest = selected ? selected.nearest.map(([index]) => edition.ids[index]) : [];
    const isCloud = state.view === "cloud";
    const ids = isCloud ? edition.ids : !selected ? [] :
      state.view === "geometry" ? [selected.id,...closest] : [...directlyLinked];
    const origin = !isCloud && selected ? selected.point : [0,0,0];
    const position = id => edition.nodes.get(id).point.map((x,i) => x-origin[i]-state.pan[i]);
    const points = ids.map(id => {
      const node = edition.nodes.get(id);
      const chosen = id === selected?.id;
      const shared = Object.hasOwn(state.bundle.shared_nodes_l2,id);
      return {id,point:position(id), color:chosen ? "text" : membership(id).color,
              radius:chosen ? 6.5 : Math.min(4.2,1.75 + Math.log2(degree(node)+1)/2) + Number(shared),
              alpha:chosen || !isCloud || directlyLinked.has(id) || shared ? 1 : .54,
              label:chosen ? id : undefined};
    });
    const lines = state.view === "geometry" && selected ? closest.map(id => ({
      coords:[position(selected.id),position(id)],color:"violet",dash:[3,4],width:1.2,alpha:.8,
    })) : edges.map(edge => ({
      coords:[position(edge.source),position(edge.target)], color:"text",width:isCloud?1:1.7,
      alpha:isCloud?.62:.85, arrow:true,
    }));
    draw({axes:headings, points, lines, grid:false, minExtent:isCloud?state.extent:.13},palette());
  }

  function search() {
    const needle = state.query.trim().toUpperCase();
    const matching = state.union.filter(id => id.includes(needle));
    const preferred = needle ? matching : [
      ...Object.keys(state.bundle.shared_nodes_l2), ...current().ids.filter(id =>
        !Object.hasOwn(state.bundle.shared_nodes_l2,id)),
    ];
    $("result-status").textContent = needle ? `${matching.length} matching LEIs` :
      `${state.union.length} across both editions`;
    list.replaceChildren(...preferred.slice(0,40).map(id => {
      const row = entry("li","");
      const button = entry("button",id);
      button.type = "button";
      button.dataset.lei = id;
      button.setAttribute("aria-current",String(id === state.selected));
      const tag = membership(id);
      button.append(entry("small",tag.short));
      button.addEventListener("click",() => select(id, true));
      row.append(button);
      return row;
    }));
  }

  function linkToEdition(id, edition) {
    const result = document.createElement("a");
    result.href = edition.source_url;
    result.textContent = `Source CSV row ${id}`;
    return result;
  }

  function neighborButton(id) {
    const choice = entry("button",id);
    choice.type = "button";
    choice.addEventListener("click",() => {
      select(id);
      $("selected").focus({preventScroll:true});
    });
    return choice;
  }

  function inspector() {
    const edition = current(), id = state.selected, selected = edition.nodes.get(id);
    const group = membership(id);
    const title = $("selected"), marker = $("membership");
    title.tabIndex = -1;
    title.textContent = id;
    marker.textContent = group.name;
    marker.dataset.membership = group.short;
    const drift = state.bundle.shared_nodes_l2[id];
    $("drift").textContent = Number.isFinite(drift) ?
      `Change in 128D vector · ${drift.toFixed(5)} L2` : "One edition supplies a vector for this LEI.";
    $("registry").href = "https://api.gleif.org/api/v1/lei-records/" + encodeURIComponent(id);
    $("registry").hidden = false;
    $("jump").hidden = Boolean(selected);
    $("related").hidden = !selected;
    if (!selected) {
      $("jump").textContent = "Show the " + short(state.editions[1-state.index].released_utc) + " edition";
      $("view-note").textContent = "This LEI is absent from the displayed change set. Its registry status is a separate field.";
      return;
    }
    $("view-note").textContent = viewNotes[state.view];
    const alternate = state.editions[1-state.index];
    $("relations").replaceChildren(...edition.adjacent.get(id).map(edge => {
      const row = entry("li","");
      const outward = edge.source === id;
      const otherId = outward ? edge.target : edge.source;
      const other = alternate.edgeIndex.get(relationshipKey(edge));
      const difference = !other ? "Reported in this edition only" :
        edge.record_sha256 === other.record_sha256 ? "Same source values in both editions" :
          "A record for this relationship also appears with different source values";
      row.append(
        neighborButton(otherId),
        entry("p",`${outward ? "Outgoing" : "Incoming"} · ${descriptions[edge.relation] || edge.relation}`),
        entry("p",`Relationship ${edge.status} · registration ${edge.registration_status}`),
        entry("p","Latest provider update " + clock(edge.registration_updated)),
        entry("p",difference),
      );
      for (const period of edge.periods) {
        const type = {RELATIONSHIP_PERIOD:"Relationship period",ACCOUNTING_PERIOD:"Accounting period",
                      DOCUMENT_FILING_PERIOD:"Filing period"}[period.type] || period.type;
        row.append(entry("p",`${type} · ${period.start ? clock(period.start) : "start unspecified"} → ${period.end ? clock(period.end) : "end unspecified"}`));
      }
      if (edge.deleted_at) row.append(entry("p","Provider deletion field " + clock(edge.deleted_at)));
      row.append(linkToEdition(edge.record_number,edition));
      return row;
    }));
    $("nearest").replaceChildren(...selected.nearest.map(([index,distance]) => {
      const row = entry("li","");
      row.append(neighborButton(edition.ids[index]),entry("p",`${distance.toFixed(5)} L2 in 128D`));
      return row;
    }));
  }

  function paint() {
    if (!state.bundle) return;
    const edition = current();
    $("frame").value = String(state.index);
    $("frame").setAttribute("aria-valuetext",short(edition.released_utc));
    frameButtons.forEach((button,index) => button.setAttribute("aria-pressed",String(index === state.index)));
    $("totals").textContent = `${edition.ids.length} LEIs · ${edition.edges.length} records · ${Object.keys(state.bundle.shared_nodes_l2).length} LEIs in both`;
    $("released").textContent = clock(edition.released_utc);
    $("released").dateTime = edition.released_utc;
    $("observed").textContent = clock(edition.observed_utc).replace(/\.\d+(?= UTC)/,"");
    $("observed").dateTime = edition.observed_utc;
    $("observed").title = clock(edition.observed_utc);
    $("catalog").href = edition.catalog_url;
    $("catalog").hidden = false;
    $("source").href = edition.source_url;
    $("source").hidden = false;
    $("checksum").textContent = "Source archive SHA-256 " + edition.source_sha256;
    search();
    inspector();
    paintCloud();
    const url = new URL(location.href);
    url.searchParams.set("release",edition.id);
    url.searchParams.set("lei",state.selected);
    history.replaceState(null,"",url);
  }

  function select(id, keepFocus = false) {
    if (!state.union.includes(id)) return;
    state.selected = id;
    state.pan = [0,0,0];
    paint();
    if (keepFocus) list.querySelector(`[data-lei="${id}"]`)?.focus({preventScroll:true});
  }

  function stop() {
    clearTimeout(state.timer);
    state.timer = null;
    $("play").textContent = "Play editions";
  }

  function jump(index) {
    stop();
    state.index = index;
    paint();
  }

  $("play").addEventListener("click",() => {
    if (state.timer) { stop(); return; }
    state.index = 0;
    paint();
    $("play").textContent = "Pause editions";
    state.timer = setTimeout(() => jump(1),1400);
  });
  $("frame").addEventListener("input",event => jump(Number(event.target.value)));
  frameButtons.forEach((button,index) => button.addEventListener("click",() => jump(index)));
  $("jump").addEventListener("click",() => jump(1-state.index));
  $("view").addEventListener("change",event => {
    state.view = event.target.value;
    state.pan = [0,0,0];
    inspector();
    paintCloud();
  });
  $("query").addEventListener("input",event => {
    state.query = event.target.value;
    search();
  });
  $("query").addEventListener("keydown",event => {
    if (event.key === "ArrowDown") { event.preventDefault(); list.querySelector("button")?.focus(); }
  });
  $("search-form").addEventListener("submit",event => {
    event.preventDefault();
    list.querySelector("button")?.click();
  });
  list.addEventListener("keydown",event => {
    if (event.key === "Escape") $("query").focus();
    if (!["ArrowDown","ArrowUp"].includes(event.key)) return;
    const buttons = [...list.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) $("query").focus();
    else buttons[next]?.focus();
  });

  function pan(x,y) {
    const a = Number(sliders.yaw.value)*Math.PI/180, b = Number(sliders.pitch.value)*Math.PI/180;
    const right = [Math.cos(a),0,Math.sin(a)];
    const up = [Math.sin(a)*Math.sin(b),Math.cos(b),-Math.cos(a)*Math.sin(b)];
    state.pan = state.pan.map((value,i) => value + .04*(x*right[i]+y*up[i]) / Number(sliders.zoom.value));
    paintCloud();
  }

  function changeCamera(name,delta) {
    const slider = sliders[name];
    let next = Number(slider.value)+delta;
    if (name === "yaw") next = ((next+540)%360)-180;
    slider.value = String(Math.min(Number(slider.max),Math.max(Number(slider.min),next)));
    slider.dispatchEvent(new Event("input",{bubbles:true}));
  }

  document.querySelectorAll("[data-atlas-time-pan]").forEach(button => {
    button.addEventListener("click",() => pan(...button.dataset.atlasTimePan.split(",").map(Number)));
  });
  camera.querySelector("button").addEventListener("click",() => {
    state.pan = [0,0,0];
    paintCloud();
  });
  canvas.addEventListener("keydown",event => {
    const movement = arrow[event.key];
    if (movement) {
      event.preventDefault();
      if (event.shiftKey) pan(...movement);
      else changeCamera(movement[0] ? "yaw" : "pitch",10*(movement[0] || movement[1]));
    } else if (["=","+","-"].includes(event.key)) {
      event.preventDefault();
      changeCamera("zoom",event.key === "-" ? -.1 : .1);
    } else if (event.key === "Home") {
      event.preventDefault();
      camera.querySelector("button").click();
    }
  });
  canvas.addEventListener("wheel",event => {
    if (document.activeElement !== canvas) return;
    event.preventDefault();
    changeCamera("zoom",event.deltaY < 0 ? .1 : -.1);
  },{passive:false});

  function theme(value) {
    document.documentElement.dataset.theme = value;
    themeButtons.forEach(button => button.setAttribute("aria-pressed",String(button.dataset.atlasTimeTheme === value)));
    try { localStorage.setItem("phaseweave-theme",value); } catch {}
    paintCloud();
  }
  themeButtons.forEach(button => button.addEventListener("click",() => theme(button.dataset.atlasTimeTheme)));
  try { theme(localStorage.getItem("phaseweave-theme") === "light" ? "light" : "dark"); } catch {}
  new ResizeObserver(paintCloud).observe(canvas);
  load().catch(() => {
    $("totals").textContent = "Atlas verification failed";
    $("error").textContent = "The verified atlas bundle could not be loaded. Reload the page to retry.";
    $("error").hidden = false;
  });
})();
