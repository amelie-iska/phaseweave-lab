"use strict";
const get=id=>document.getElementById(id);
const metric={corrRep:"CORR",corr60Rep:"CORR60",mmcRep:"MMC",mmc60Rep:"MMC60",
  neutralCorrRep:"Neutral CORR",neutralMmcRep:"Neutral MMC",alphaRep:"Alpha"};
const archive={mmc:"MMC20",mmc60:"MMC60",v2_corr20:"CORR20",v2_corr60:"CORR60"};
let data;
const num=value=>value==null?"—":value.toFixed(6);
function table(headers,rows){
  const t=document.createElement("table"), top=t.createTHead().insertRow(), body=t.createTBody();
  headers.forEach(name=>{const c=document.createElement("th");c.scope="col";c.textContent=name;top.append(c);});
  for(const row of rows){
    const tr=body.insertRow();
    row.forEach(v=>tr.insertCell().textContent=String(v));
  }
  return t;
}
function roster(){
  if(!data)return;
  const list=data.tournament_model_lists[get("numerai-tournament").value];
  const keys=Object.keys(list.rows[0]).filter(k=>metric[k]);
  get("numerai-order").textContent="API sort · "+metric[list.metric]+". Values are public model reputation scores.";
  get("numerai-table").replaceChildren(table(["Displayed rank","Model",...keys.map(k=>metric[k])],
    list.rows.map(m=>[m.rank,m.username,...keys.map(k=>num(m[k]))])));
}
function history(){
  if(!data)return;
  const round=data.current_top20_retrospective_scores.find(row=>row.round===Number(get("numerai-round").value));
  const keys=Object.keys(round.resolved_nonnull).filter(k=>archive[k]);
  const ranks=data.tournament_model_lists.classic.rows;
  get("numerai-round-description").textContent="Round "+round.round+" · "+round.round_target+
    " · these models are selected from the current table. Their ranks reflect the snapshot date.";
  get("numerai-resolved").replaceChildren(table(["Current rank","Model",...keys.map(k=>archive[k])],
    ranks.map(m=>[m.rank,m.username,...keys.map(k=>num(round.scores_by_model[m.username]?.[k]))])));
}
async function init(){
  const response=await fetch("numerai-top20-v1.json");
  if(!response.ok)throw new Error("Missing public data");
  const raw=await response.json();
  if(raw.format!=="phaseweave-numerai-public-audit-v1")throw new Error("Unexpected public data");
  data=raw;
  const current=data.classic_current;
  get("numerai-session").textContent="Snapshot "+data.as_of_utc.slice(0,19).replace("T"," ")+" UTC · Classic round "+current.number+
    " · "+current.target+" · on-time cutoff "+current.closeStakingTime.replace("T"," ").replace("Z"," UTC")+".";
  get("numerai-round").replaceChildren(...data.current_top20_retrospective_scores.map(x=>new Option(String(x.round),x.round)));
  roster();history();
}
get("numerai-round").addEventListener("change",history);
get("numerai-tournament").addEventListener("change",roster);
init().catch(()=>{get("numerai-session").textContent="The public leaderboard receipt could not load.";});

async function mediumComparison() {
  const response = await fetch("numerai-medium-development-v1.json");
  if (!response.ok) throw Error("Medium comparison unavailable");
  const report = await response.json();
  const select = get("numerai-medium-period");
  const selected = report.models.find(row=>row.id===report.selection.winner);
  function repaint() {
    const period = select.value;
    const values = row=>period==="overall"?row.overall:row.by_year[period];
    const dates = (period==="overall"?report.cohort.development_dates:report.cohort.by_year[period].dates);
    const ordered = report.models.slice().sort((a,b)=>values(b).neutral_corr-values(a).neutral_corr);
    get("numerai-medium-summary").textContent = dates+" comparable dates · full-development selection "+selected.label;
    get("numerai-medium-table").replaceChildren(table(
      ["Model", "Neutral CORR", "Raw CORR", "Neutral contribution", "Dates above benchmark"],
      ordered.map(row=> {
        const score=values(row);
        return [row.label,num(score.neutral_corr),num(score.raw_corr),num(score.benchmark_neutral_contribution),
          score.neutral_corr_wins_over_benchmark+" / "+dates];
      })));
  }
  select.addEventListener("change",repaint);
  repaint();
}
mediumComparison().catch(()=>{get("numerai-medium-summary").textContent="The Medium comparison receipt could not load.";});

async function breadthComparison() {
  const response = await fetch("numerai-breadth-development-v1.json");
  if (!response.ok) throw Error("Breadth comparison unavailable");
  const report = await response.json();
  const select = get("numerai-breadth-period");
  const summary = get("numerai-breadth-summary");
  const results = get("numerai-breadth-table");
  function repaint() {
    const period = select.value;
    const stats = row => period === "overall" ? row.overall : row.by_year[period];
    const contrast = stats(report.primary_contrast);
    const delta = contrast.mean_paired_ncorr_delta;
    const signed = (delta >= 0 ? "+" : "−") + num(Math.abs(delta));
    const ordered = report.models.slice().sort((a, b) => stats(b).neutral_corr - stats(a).neutral_corr);
    summary.textContent = "Restored quintiles vs same-family · " + signed + " mean neutral CORR · "
      + contrast.wins + " wins, " + contrast.ties + " ties, " + contrast.losses + " losses across "
      + contrast.compared_dates + " dates.";
    results.replaceChildren(table(
      ["Model", "Predictors", "Neutral CORR", "Raw CORR", "Benchmark-relative contribution", "Dates above LightGBM"],
      ordered.map(row => {
        const score = stats(row);
        const wins = row.id === report.benchmark_id ? "—"
          : score.neutral_corr_wins_over_benchmark + " / " + contrast.compared_dates;
        return [row.label, row.predictors ?? "—", num(score.neutral_corr), num(score.raw_corr),
          num(score.benchmark_neutral_contribution), wins];
      })));
  }
  select.addEventListener("change", repaint);
  repaint();
}
breadthComparison().catch(()=>{get("numerai-breadth-summary").textContent="The breadth comparison receipt could not load.";});

async function fixedCandidateComparison() {
  const paths = {
    wide: "numerai-wide-2022-23-v1.json",
    preterminal: "numerai-preterminal-2024-v1.json",
    audit: "numerai-2022-23-validation-v1.json",
    development: "numerai-neural-development-v1.json",
    multitarget: "numerai-fullwidth-multitarget-v1.json",
    scale: "numerai-scale-development-v1.json",
    rolling: "numerai-rolling-development-v1.json",
  };
  const reports = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw Error("Validation receipt unavailable");
    return [key, await response.json()];
  }));
  const periods = Object.fromEntries(reports);
  const select = get("numerai-fresh-period");
  const block = get("numerai-fresh-block");
  const summary = get("numerai-fresh-summary");
  const results = get("numerai-fresh-table");
  const labels = {
    lgbm_jupiter_60: "Published LightGBM Jupiter 60",
    "local-lightgbm-jupiter60": "Local LightGBM Jupiter 60 · 350",
    binned: "Local LightGBM Jupiter 60 · 1,017",
    all_numeric: "Static LightGBM Jupiter 60 · 1,039",
    "same-target-fullwidth-blend": "Wide same-target seed blend",
    "diverse-target-fullwidth-blend": "Wide diverse-target blend",
    "jupiter60-slot2": "Wide Jupiter 60 · seed 20261121",
    "jupiter20-slot2": "Wide Jupiter 20 · seed 20261121",
    "jupiter60-slot3": "Wide Jupiter 60 · seed 20261122",
    "factor-neutral60-slot3": "Wide factor-neutral 60 · seed 20261122",
    rolling_all_numeric: "Rolling LightGBM Jupiter 60 · 1,039",
    "fixed-medium-blend": "Fixed Medium tree blend",
    "static-all-1039": "Static LightGBM Jupiter 60 · 1,039",
    "rolling-all-1039": "Rolling LightGBM Jupiter 60 · 1,039",
    "neural-multitarget-blend": "Multitarget residual MLP blend",
    "tree-neural-blend": "75% Medium HGB + 25% residual MLP",
    "local-lightgbm-multitarget": "Locally trained LightGBM multitarget blend",
  };
  function repaint() {
    const report = periods[select.value];
    const entries = Object.entries(report.overall).sort((a, b) => b[1].neutral_corr - a[1].neutral_corr);
    const boundsKey = "neutral_corr_paired_ci_"+block.value+"_weeks";
    const interval = score => score[boundsKey]?.map(num).join(" to ") ?? "Unavailable";
    const contrast = {wide: "Rolling versus static", multitarget: "Diverse versus same-target",
      preterminal:"Diverse versus same-target"}[select.value];
    const primary = contrast ? " "+contrast+" "+num(report.primary.neutral_corr_delta)
      +" neutral CORR." : "";
    const precision = select.value === "preterminal"
      ? " The 13-date panel cannot support either configured block interval."
      : contrast ? " Paired 95% interval "+interval(report.primary)+"." : "";
    summary.textContent = report.dates + " matched dates · " + report.keys.toLocaleString("en-US")
      + " stock-date keys · Reference " + (labels[report.reference] ?? report.reference) + "." + primary + precision;
    results.replaceChildren(table(
      ["Forecast", "Neutral CORR", "Raw CORR", "Paired neutral Δ", block.value+"-week 95% interval", "Dates ahead"],
      entries.map(([key, score]) => [labels[key] ?? key, num(score.neutral_corr), num(score.raw_corr),
        key === report.reference ? "—" : num(score.neutral_corr_delta),
        key === report.reference ? "—" : interval(score),
        key === report.reference ? "Reference" : score.neutral_corr_wins + " / " + report.dates])));
  }
  select.addEventListener("change", repaint);
  block.addEventListener("change", repaint);
  repaint();
}
fixedCandidateComparison().catch(() => {
  get("numerai-fresh-summary").textContent = "The fixed-candidate results could not load.";
});
