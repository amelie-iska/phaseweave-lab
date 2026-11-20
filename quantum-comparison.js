"use strict";

const $ = (id) => document.getElementById("quantum-" + id);
const profiles = ["pilot", "registered"];
const titles = { pilot: "Width 32 · Pilot", registered: "Width 200 · Registered" };
const labels = { validation: "Validation", stress: "Stress", test: "October test", new_asset: "New assets" };
const integer = new Intl.NumberFormat("en-US");
const score = new Intl.NumberFormat("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const signed = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 6, maximumFractionDigits: 6, signDisplay: "exceptZero",
});

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme").textContent = theme === "light" ? "Dark theme" : "Light theme";
  try { localStorage.setItem("phaseweave-theme", theme); } catch {}
}

try {
  if (localStorage.getItem("phaseweave-theme") === "light") applyTheme("light");
} catch {}
$("theme").addEventListener("click", () => applyTheme(
  document.documentElement.dataset.theme === "light" ? "dark" : "light"
));

function assert(condition) {
  if (!condition) throw new Error("Incomplete comparison receipt");
}

function validate(data) {
  assert(data.format === "phaseweave.quantum-comparison.v1");
  assert(data.variants.length === 56);
  const widths = [32, 200];
  const fits = [56, 112];
  const seeds = [[20261225], [20261225, 20261226]];
  for (const [index, profile] of profiles.entries()) {
    const cohort = data.cohorts[profile];
    assert(cohort.width === widths[index] && cohort.fits === fits[index]);
    assert(cohort.seeds.join(",") === seeds[index].join(","));
    assert(Object.keys(labels).every((fold) => Number.isFinite(cohort.persistence_mae_bps[fold])));
  }
  const identities = new Set();
  for (const row of data.variants) {
    assert(Object.hasOwn(data.axes.backbone, row.backbone)
      && Object.hasOwn(data.axes.attention, row.temporal_attention)
      && Object.hasOwn(data.axes.patch, row.patch));
    identities.add([row.backbone, row.temporal_attention, row.patch].join("-"));
    for (const profile of profiles) {
      const results = row.results[profile];
      assert(results.map((fit) => fit.seed).join(",") === data.cohorts[profile].seeds.join(","));
      for (const fit of results) {
        for (const fold of Object.keys(labels)) {
          const values = fit.scores[fold];
          assert(values.length === 6 && values.every(Number.isFinite));
        }
      }
    }
  }
  assert(identities.size === 56);
}

function addOptions(id, mapping) {
  const select = $(id);
  for (const [key, value] of Object.entries(mapping)) select.add(new Option(value, key));
}

function spatial(row, axes) {
  const operator = row.local_spatial_operator;
  const local = operator === "gat" ? "GAT local softmax"
    : operator ? axes.backbone[operator] + " message passing" : "";
  const token = row.spatial_tokengt_attention === "none" ? ""
    : "TokenGT " + axes.attention[row.spatial_tokengt_attention].toLowerCase();
  return [local, token].filter(Boolean).join(" · ");
}

function showCohorts(data, fold) {
  const cards = profiles.map((profile) => {
    const study = data.cohorts[profile];
    const baseline = study.persistence_mae_bps[fold];
    const improved = data.variants.flatMap((row) => row.results[profile])
      .filter((fit) => fit.scores[fold][0] < baseline).length;
    const card = element("article", undefined, "quantum-cohort quantum-" + profile);
    card.append(
      element("h2", titles[profile]),
      element("p", `${integer.format(study.rows.train)} train windows · ${integer.format(study.rows.test)} test windows`),
      element("p", `${study.fits} fits · ${study.epochs} epochs per fit · ${integer.format(study.updates_per_fit)} updates per fit`),
      element("p", `${labels[fold]} persistence MAE ${score.format(baseline)} bp`, "quantum-baseline"),
      element("p", `${improved} of ${study.fits} fits below persistence MAE`),
    );
    return card;
  });
  $("cohorts").replaceChildren(...cards);
}

function source(label, info) {
  $("sources").append(element("dt", label), element("dd", info));
}

function populate(data) {
  $("target").textContent = data.target + " across seven backbones, four patch algebras, and two temporal attention operators.";
  addOptions("backbone", data.axes.backbone);
  addOptions("attention", data.axes.attention);
  addOptions("patch", data.axes.patch);
  $("backbone").value = "tokengt";
  for (const profile of profiles) {
    const study = data.cohorts[profile];
    for (const seed of study.seeds) {
      const header = element("th", `Seed ${seed}`, "quantum-" + profile);
      header.scope = "col";
      $("seed-headers").append(header);
    }
    source(titles[profile], `${study.source_path} · SHA-256 ${study.source_sha256}`);
  }
  source("Frozen corpus", data.corpus_sha256);
  source("Registration", data.registration_sha256);
  $("filters").disabled = false;
  $("download").hidden = false;
  $("table-wrap").hidden = false;
}

function modelCell(fit, fold, metric, isControl) {
  const [mae, rmse, delta, low, high, days] = fit.scores[fold];
  const cell = element("td");
  cell.dataset.modelCell = String(fit.seed);
  if (metric === "fit") {
    cell.append(element("strong", integer.format(fit.parameters)),
      element("small", `Epoch ${fit.selected_epoch} · ${integer.format(fit.patch_parameters)} patch`));
  } else if (metric === "rmse") {
    cell.append(element("strong", score.format(rmse)));
  } else if (metric === "interval") {
    cell.append(element("strong", isControl ? "Control" : `${signed.format(low)} to ${signed.format(high)}`),
      element("small", `${days} UTC days`));
  } else {
    cell.append(element("strong", score.format(mae)),
      element("small", isControl ? "Control" : `Δ ${signed.format(delta)}`));
    if (!isControl) cell.dataset.improves = String(delta < 0);
  }
  return cell;
}

const captions = {
  mae: "MAE in basis points (bp). Δ compares each patch to its matched classical cosine control.",
  rmse: "RMSE in basis points (bp).",
  interval: "Paired 95% UTC-day block interval in basis points (bp).",
  fit: "Total parameters, patch parameters, and earliest selected validation epoch.",
};

function render(data) {
  const fold = $("fold").value;
  const metric = $("metric").value;
  const filters = [
    [$("backbone").value, "backbone"],
    [$("attention").value, "temporal_attention"],
    [$("patch").value, "patch"],
  ];
  const variants = data.variants.filter((row) => filters.every(([value, key]) => !value || row[key] === value));
  const rows = variants.map((row) => {
    const tr = element("tr");
    const backbone = element("th", data.axes.backbone[row.backbone]);
    backbone.scope = "row";
    const attention = element("td", spatial(row, data.axes));
    attention.append(element("small", data.axes.attention[row.temporal_attention] + " temporal"));
    const patch = element("td", data.axes.patch[row.patch]);
    tr.append(backbone, attention, patch);
    for (const profile of profiles) {
      for (const fit of row.results[profile]) tr.append(modelCell(fit, fold, metric, row.patch === "classical"));
    }
    return tr;
  });
  $("rows").replaceChildren(...rows);
  $("caption").textContent = captions[metric];
  const countText = profiles.map((profile) => {
    const { width, rows: counts } = data.cohorts[profile];
    return `${integer.format(counts[fold])} windows at width ${width}`;
  });
  $("status").textContent = `${variants.length} of 56 variants · ${labels[fold]} · ${countText.join(" · ")}`;
  showCohorts(data, fold);
}

fetch("quantum-comparison-v1.json")
  .then((response) => {
    if (!response.ok) throw new Error("Missing comparison receipt");
    return response.json();
  })
  .then((data) => {
    validate(data);
    populate(data);
    $("filters").addEventListener("change", () => render(data));
    render(data);
  })
  .catch(() => {
    $("status").textContent = "Finalized comparison data is unavailable.";
  });
