"use strict";

(() => {
  const el = id => document.getElementById("ordered-" + id);
  const unit = [0,1,2];
  const gauges = [unit,[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const names = ["jade","copper","violet"];
  const multiply = (a,b) => b.map(index=>a[index]);
  const inverse = a => unit.map(index=>a.indexOf(index));
  const trace = p => p.reduce((sum,index,i)=>sum+(index===i?1:0),-1);
  const showMap = p => p.map((index,i)=>i+"→"+index).join("  ");
  const showWord = word => word.map(value=>"g"+["","₁","₂","₃","₄"][Math.abs(value)]+(value<0?"⁻¹":"")).join(" ");
  let witness, scene, interval;
  const draw = Reasoning3D.bind(document.getElementById("latent-chart"),el("camera"),redraw,()=>{});

  function redraw() {
    if (!scene) return;
    const styles = getComputedStyle(document.documentElement);
    const palette = Object.fromEntries(["text","muted","line","jade","copper","blue","violet"].map(name=>[name,styles.getPropertyValue(
      (name==="blue"||name==="violet"?"--latent-":"--")+name).trim()]));
    draw(scene,palette);
  }

  function point(x,i) {
    const a = 2*Math.PI*i/3;
    return [x,.85*Math.cos(a),.85*Math.sin(a)];
  }

  function wordOf() {
    if (el("word").value==="face") return witness.face_words[0];
    if (el("word").value==="commutator") return [1,2,-1,-2];
    return [1,2];
  }

  function updateTable(rows, values) {
    rows.replaceChildren();
    for (const [label,...entries] of values) {
      const row=rows.insertRow();
      const header=document.createElement("th");
      header.scope="row";
      header.textContent=label;
      row.append(header);
      for (const value of entries) row.insertCell().textContent=String(value);
    }
  }

  function render() {
    const selected = witness.witness[Number(el("case").value)];
    const g = gauges[Number(el("gauge").value)];
    const loops = selected.permutations.map(value=>multiply(multiply(g,value),inverse(g)));
    const word = wordOf();
    const steps = Number(el("step").value);
    const apply = letters => letters.reduce((prefix,letter)=>{
      const next = loops[Math.abs(letter)-1];
      return multiply(prefix,letter>0?next:inverse(next));
    },unit);
    const prefix = apply(word.slice(0,steps));
    const face = apply(witness.face_words[0]);
    const single = loops.map(trace);
    const mixed = trace(apply([1,2]));
    if (face.some((x,i)=>x!==i) || single.some((x,i)=>x!==selected.single_traces[i]) || mixed!==selected.mixed_trace_12) {
      throw Error("Exact transport differs from the published receipt");
    }
    el("status").textContent=(steps ? showWord(word.slice(0,steps)) : "Identity")+" · "+steps+" / "+word.length+" factors";
    el("caption").textContent=showWord(word);
    updateTable(el("values"),[
      ["Current map",showMap(prefix)],["Current standard trace",trace(prefix)],["Face transport","Identity"],
      ["Single generator traces",single.join(" / ")],["Mixed standard trace",mixed],
      ["Twisted Betti dimensions",selected.twisted_betti.join(" / ")],
      ["Flat tuples / common-frame classes",witness.flat_assignments+" / "+witness.simultaneous_conjugacy_orbits],
    ]);
    const points=unit.flatMap(i=>[
      {point:point(-1.3,i),label:"in "+i,color:names[i],radius:6},
      {point:point(1.3,i),label:"out "+i,color:"text",radius:6},
    ]);
    scene={grid:false,axes:[],points,faces:[],framingScale:.37,minExtent:1.4,
      lines:unit.map(i=>({coords:[point(-1.3,i),point(1.3,prefix[i])],color:names[i],width:3.4,arrow:true}))};
    redraw();
  }

  function stop() {
    clearInterval(interval);
    interval=null;
    el("play").setAttribute("aria-pressed","false");
    el("play").textContent="Play factors";
  }

  function setWord() {
    stop();
    const size = wordOf().length;
    el("step").max=size;
    el("step").value=size;
    render();
  }

  function theme(mode) {
    document.documentElement.dataset.theme=mode;
    document.querySelectorAll("[data-scheme]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn.dataset.scheme===mode)));
    try { localStorage.setItem("phaseweave-theme",mode); } catch {}
    redraw();
  }
  try { theme(localStorage.getItem("phaseweave-theme")==="light"?"light":"dark"); } catch {}
  document.querySelectorAll("[data-scheme]").forEach(btn=>btn.onclick=()=>theme(btn.dataset.scheme));
  new ResizeObserver(redraw).observe(document.getElementById("latent-chart"));

  async function fetchJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw Error("Data unavailable");
    return response.json();
  }

  fetchJSON("ordered-transport-proof-v1.json").then(receipt=>{
    witness=receipt.same_rotation;
    el("gauge").replaceChildren(...gauges.map((g,i)=>new Option(i===0?"Original frame":"State order "+g.join(" / "),i)));
    ["case","gauge","step"].forEach(id=>el(id).oninput=()=>{stop();render();});
    el("word").onchange=setWord;
    el("play").onclick=()=>{
      if (interval) {stop();return;}
      if (el("step").value===el("step").max) el("step").value=0;
      el("play").setAttribute("aria-pressed","true");
      el("play").textContent="Pause factors";
      render();
      interval=setInterval(()=>{
        el("step").value=Number(el("step").value)+1;
        render();
        if (el("step").value===el("step").max) stop();
      },380);
    };
    setWord();
  }).catch(()=>{el("status").textContent="The exact ribbon receipt is unavailable.";});

  fetchJSON("qutrit-transport-fx-v2.json").then(receipt=>{
    if (receipt.schema!=="phaseweave.qutrit-wilson-fx.v2") throw Error("Invalid qutrit score receipt");
    const labels={"raw-ridge":"Raw graph ridge","single-qutrit":"Single qutrit traces","mixed-qutrit":"Mixed qutrit traces",
      "common-axis-mixed":"Common-axis mixed traces","product-of-characters":"Products of single traces","commutator-qutrit":"Qutrit commutator words"};
    el("horizon").replaceChildren(...receipt.identity.horizons_s.map(h=>new Option(h+" seconds",h)));
    const fixed = value => value.toFixed(6);
    function results() {
      const split=receipt.splits[el("split").value], horizon=el("horizon").value;
      const digits=x=>x.toLocaleString("en-US");
      el("result-status").textContent=digits(split.metrics["raw-ridge"][horizon].rows)+" scored targets · "+
        digits(split.support)+" complete inputs out of "+digits(split.rows)+" windows · "+
        (receipt.identity.gpu||"CPU")+" matrix simulation.";
      const audit=receipt.commutator_study.audits[el("split").value];
      el("reduction").textContent="The two-factor mixed trace matched its scalar formula within "+
        audit.largest_absolute_factorization_error.toExponential(2)+". Reversing a longer word changed at least one "+
        "commutator in "+digits(audit.longer_word_rows_changed_by_reversal)+" complete windows.";
      updateTable(el("scores"),receipt.identity.fit_variants.map(key=>{
        const paired=split.mixed_minus[key]?.[horizon];
        const age=paired?.utc_day_interval;
        return [labels[key],fixed(split.metrics[key][horizon].mae_bps),
          paired?fixed(paired.delta_bps):"—",age?"["+fixed(age.lower_95)+", "+fixed(age.upper_95)+"]":"—"];
      }));
    }
    el("split").onchange=results;
    el("horizon").onchange=results;
    results();
  }).catch(()=>{el("result-status").textContent="The measured qutrit comparison is unavailable.";});
})();
