"use strict";
(() => {
  const get = name => document.getElementById("radix-"+name);
  const cohort = get("cohort"), seed = get("seed"), work = get("work");
  const number = (value,digits=6) => value.toFixed(digits);
  const interval = (lower,upper) => "["+number(lower)+", "+number(upper)+"]";
  const seeds = [20261225,20261226];

  function grid(headers,rows) {
    const table=document.createElement("table");
    const row=table.createTHead().insertRow();
    for (const label of headers) {
      const cell=document.createElement("th");
      cell.scope="col"; cell.textContent=label; row.append(cell);
    }
    const body=table.createTBody();
    for (const [head,...values] of rows) {
      const entry=body.insertRow(), name=document.createElement("th");
      name.scope="row"; name.textContent=head; entry.append(name);
      for (const value of values) entry.insertCell().textContent=value;
    }
    return table;
  }

  function forecast(data) {
    const later=cohort.value==="november";
    const fold=later ? data.november.results : data.forecasts.splits[cohort.value];
    const selected=seed.value==="mean" ? seeds : [Number(seed.value)];
    const score=(radix,phase)=>{
      const values=selected.map(s=>fold.cells["tokengt-q"+radix+"-"+phase+"-"+s].mae_bps);
      return number(values.reduce((sum,x)=>sum+x,0)/values.length);
    };
    const rows=[2,3,5].map(q=>{
      const row=fold.entangling_minus_product[q];
      const pair=seed.value==="mean" ? row.mean_over_fixed_seeds : row.by_seed[seed.value];
      return [q,score(q,"entangling"),score(q,"product"),number(pair.delta_mae_bps),
        interval(pair.lower_95,pair.upper_95)];
    });
    const days=fold.entangling_minus_product[2].mean_over_fixed_seeds.utc_day_blocks;
    const coverage=later ? " of "+data.november.predictor_rows.toLocaleString("en-US")+" sealed predictors" : "";
    get("status").textContent=fold.rows.toLocaleString("en-US")+" matched target windows"+coverage+
      " across "+days+" UTC-day groups · Persistence "+number(fold.cells.persistence.mae_bps)+" log bp MAE.";
    get("forecast").replaceChildren(grid(
      ["Levels per wire","Entangling MAE","Product MAE","Paired change","95% day-block interval"],rows));
  }

  function resources(data) {
    const rows=data.measurements.arms.map(r=>{
      const dense=r.timings.dense[work.value], local=r.timings.local[work.value];
      const mem = stat=>number(stat.additional_peak_bytes/1048576,2);
      const ms = stat=>number(stat.median_ms,3);
      return [r.radix+" · "+r.phase,r.joint_amplitudes,ms(dense),ms(local),mem(dense),mem(local)];
    });
    get("resource").replaceChildren(grid(
      ["Circuit","Joint amplitudes","Dense ms","Reduced ms","Dense MiB","Reduced MiB"],rows));
  }

  fetch("circuit-radix-v1.json").then(response=>{
    if(!response.ok) throw Error("Missing comparison receipt");
    return response.json();
  }).then(data=>{
    if(data.format!=="phaseweave.circuit-radix-public.v1") throw Error("Unknown comparison receipt");
    cohort.addEventListener("change",()=>forecast(data));
    seed.addEventListener("change",()=>forecast(data));
    work.addEventListener("change",()=>resources(data));
    forecast(data);resources(data);
  }).catch(()=>{ get("status").textContent="The verified comparison could not load."; });
})();
