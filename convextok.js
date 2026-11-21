"use strict";

(() => {
  const expectedRegistry = "c027b557d54bc8a0a74815272dccdbae968e5052fe3d77b3147406d170e07dd9";
  const expectedBundle = "f376522800dd235de306d179ec6710816d5883c221260be9ccb57e827245f099";
  const expectedTokenizer = "203ab6716ccf917385277dc06da18b6b53b84eed7bffafa86c6d2f1af88a0d5f";
  const get = suffix => document.getElementById("concept-" + suffix);
  const example = get("example"), profile = get("profile"), status = get("status"), filter = get("find");
  const evidence = get("evidence"), download = get("download");
  const releaseDates = ["2026-09-16", "2026-10-28"];
  let bundle, byName;
  const element = (tag, content, className) => {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const name = value => value.replaceAll("_", " ");

  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  async function matchesBytes(bytes, expected) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const result = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, "0")).join("");
    return result === expected;
  }
  const matches = (value, expected) => matchesBytes(new TextEncoder().encode(canonical(value)), expected);

  async function load() {
    const result = await fetch("convextok-concepts-v1.json");
    if (!result.ok) throw Error("Bundle unavailable");
    const bytes = await result.arrayBuffer();
    if (!await matchesBytes(bytes, expectedBundle)) throw Error("Demo checksum changed");
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.format !== "phaseweave.convextok-concepts-site.v1" ||
        data.packet_format !== "phaseweave.convextok-concepts.v1" ||
        data.registry_sha256 !== expectedRegistry || data.tokenizer_sha256 !== expectedTokenizer ||
        !await matches(data.registry, expectedRegistry) ||
        data.examples.length !== releaseDates.length) throw Error("Unexpected vocabulary");
    const {concepts_begin: begin, concepts_end: end} = data.registry.controls;
    const ids = new Map(data.registry.concepts.map(entry => [entry.name, entry.id]));
    for (const [i, item] of data.examples.entries()) {
      const day = releaseDates[i];
      const target = "https://www.federalreserve.gov/newsevents/pressreleases/monetary" + day.replaceAll("-", "") + "a.htm";
      if (item.id !== day || item.record.to !== target || item.record.utc !== day + "T18:00:00Z" ||
          !item.legacy_token_ids.every(id => Number.isInteger(id) && id >= 4 && id < begin) ||
          !await matches(item.legacy_token_ids, item.legacy_prefix_sha256)) throw Error("Unexpected public source prefix");
      for (const variant of item.profiles) {
        const suffix = variant.token_ids_suffix;
        const special = suffix.slice(1, -1).filter(id => id >= begin);
        const observed = variant.annotations.map(tag => ids.get(tag.name));
        if (suffix[0] !== begin || suffix.at(-1) !== end || String(special) !== String(observed) ||
            !await matches(suffix, variant.suffix_sha256)) throw Error("Unexpected concept suffix");
      }
    }
    return data;
  }

  function context() {
    const item = bundle.examples.find(row => row.id === example.value);
    const selection = item.profiles.find(row => row.id === profile.value);
    return {item, selection};
  }

  function title(text, id) {
    const fragment = document.createDocumentFragment();
    fragment.append(element("span", String(id), "concept-id"), " ", element("code", text));
    return fragment;
  }

  function showExample() {
    const {item, selection} = context();
    const {record, legacy_token_ids: prefix} = item;
    const {token_ids_suffix: suffix, annotations} = selection;
    const clock = get("time"), link = get("link");
    clock.dateTime = record.utc;
    clock.textContent = record.utc.slice(0, -1).replace("T", " ") + " UTC · " + item.clock;
    link.href = record.to;
    link.hidden = false;
    get("prefix-meta").textContent = prefix.length + " IDs · " + item.canonical_input_bytes + " UTF-8 bytes";
    get("suffix-meta").textContent = suffix.length + " IDs · " + annotations.length + " concepts";
    get("preview").replaceChildren(...prefix.slice(0, 12).map(id => element("li", id)));
    get("prefix").textContent = JSON.stringify(prefix);
    get("record").textContent = JSON.stringify(record, null, 2);
    get("suffix").textContent = JSON.stringify(suffix);
    get("tags").replaceChildren(...annotations.map(tag => {
      const node = element("li");
      const mode = tag.evidence.mode === "record" ? "Source record · " + tag.evidence.fields.join(", ")
        : "Specified context · " + tag.evidence.reference;
      node.append(title(tag.name, byName.get(tag.name).id), element("p", mode));
      if (Object.keys(tag.parameters).length) node.append(element("pre", JSON.stringify(tag.parameters)));
      return node;
    }));
  }

  function chooseRelease() {
    const item = bundle.examples.find(row => row.id === example.value);
    const selected = profile.value;
    profile.replaceChildren(...item.profiles.map(row => new Option(row.label, row.id)));
    if (item.profiles.some(row => row.id === selected)) profile.value = selected;
    showExample();
  }

  function parameter(key, spec) {
    if (spec.type === "enum") return key + " ∈ " + spec.values.join(", ");
    if (spec.type === "distinct_asset_cycle") return key + " · " + spec.min + "–" + spec.max + " distinct assets";
    if (spec.type === "boolean") return key + " · boolean";
    return key + " · " + spec.type + " " + spec.min + " to " + spec.max;
  }

  function renderRegistry() {
    const search = filter.value.trim().toLowerCase();
    const fields = bundle.registry.concepts.filter(row => {
      if (evidence.value !== "all" && evidence.value !== row.evidence_mode) return false;
      return !search || JSON.stringify(row).toLowerCase().includes(search) ||
        name(row.name).includes(search);
    });
    get("count").textContent = fields.length + " of " + bundle.registry.concepts.length + " concepts";
    get("catalog").replaceChildren(...fields.map(row => {
      const card = element("article"), header = element("h3");
      header.append(title(row.name, row.id));
      card.append(header, element("p", row.meaning), element("p", row.evidence_mode === "record" ? "From record" : "Specified"));
      const params = Object.entries(row.parameters);
      if (params.length) {
        const list = element("ul");
        list.append(...params.map(([key, spec]) => element("li", parameter(key, spec))));
        card.append(list);
      }
      return card;
    }));
  }

  function downloadPacket() {
    const {item, selection} = context();
    const data = {
      format: bundle.packet_format,
      tokenizer_sha256: bundle.tokenizer_sha256,
      vocabulary_sha256: bundle.registry_sha256,
      token_ids: [...item.legacy_token_ids, ...selection.token_ids_suffix],
    };
    const url = URL.createObjectURL(new Blob([canonical(data) + "\n"], {type: "application/json"}));
    const link = element("a");
    link.href = url;
    link.download = "phaseweave-concepts-" + item.id + "-" + selection.id + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function theme(value) {
    document.documentElement.dataset.theme = value;
    document.querySelectorAll("[data-theme-value]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.themeValue === value));
    });
    try { localStorage.setItem("phaseweave-theme", value); } catch {}
  }

  document.querySelectorAll("[data-theme-value]").forEach(button => {
    button.addEventListener("click", () => theme(button.dataset.themeValue));
  });
  try { if (localStorage.getItem("phaseweave-theme") === "light") theme("light"); } catch {}
  load().then(data => {
    bundle = data;
    byName = new Map(data.registry.concepts.map(row => [row.name, row]));
    example.replaceChildren(...data.examples.map(row => new Option(row.label, row.id)));
    chooseRelease();
    renderRegistry();
    example.disabled = profile.disabled = download.disabled = false;
    example.addEventListener("change", chooseRelease);
    profile.addEventListener("change", showExample);
    filter.addEventListener("input", renderRegistry);
    evidence.addEventListener("change", renderRegistry);
    download.addEventListener("click", downloadPacket);
    status.textContent = "Verified v1 registry · " + data.registry_sha256.slice(0, 12);
  }).catch(() => {
    status.textContent = "The frozen vocabulary or example packets could not be verified.";
  });
})();
