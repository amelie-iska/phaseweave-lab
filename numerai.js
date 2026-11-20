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
