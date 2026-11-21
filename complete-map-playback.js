"use strict";

const CompleteMapPlayback = (() => {
  const lastFrame=48;

  function bind(root,details,redraw,selectFace,reducedMotion) {
    const gauge=CompleteMapGauge;
    const input=name=>root.querySelector('[data-walk="'+name+'"]');
    const value=name=>Number(input(name).value);
    const tell=(name,text)=>{
      const element=input(name);
      if (element.textContent!==text) element.textContent=text;
    };
    let map,model,field,flux,frames,initialArc,selectedArc,timer;
    let playing=!reducedMotion;

    function frame(t) {
      while(frames.length<=t) {
        frames.push(gauge.step(model,frames.at(-1),field,input("operator").value==="coin"));
      }
      return frames[t];
    }

    function playLoop() {
      clearInterval(timer);
      input("play").textContent=playing ? "Pause walk" : "Play walk";
      if (details.open && model && playing) {
        timer=setInterval(()=>{
          input("time").value=(value("time")+1)%(lastFrame+1);
          redraw();
        },Number(input("speed").value));
      }
    }

    function reset() {
      const mode=input("connection").value;
      field=gauge.connection(model,mode,value("exponent"),value("period"));
      flux=gauge.exponents(model,field);
      frames=[gauge.basisState(model,initialArc)];
      input("time").value=0;
      const flat=mode==="flat" || mode==="flat-local";
      const local=mode==="local" || mode==="flat-local";
      input("period").disabled=!flat;
      input("exponent").disabled=mode==="zero";
      input("inspect").disabled=mode==="zero";
      const notes=[];
      if (flat) {
        const path=model.periodArcs[value("period")].map(i=>model.arcs[i].u);
        notes.push("The marked global loop is "+[...path,path[0]].join(" → ")+".");
      }
      if (local) {
        const {edge,positive,negative}=model.localEdge;
        const dart=model.edges[edge].join(" → ");
        notes.push("The edited dart is "+dart+". It changes faces "+(positive+1)+" and "+(negative+1)+".");
      }
      if (mode==="zero") notes.push("Every canonical link exponent is zero.");
      if (!model.localEdge) notes.push("This map has one face, so a local flux pair needs a refined map.");
      tell("setup",notes.join(" "));
    }

    function setup(mapValue) {
      map=mapValue;
      if (!map) {
        model=null;
        playLoop();
        return;
      }
      const q=value("radix");
      model=gauge.create(map,q);
      initialArc=model.arcIds[1];
      selectedArc=initialArc;
      for(const name of ["exponent","gauge"]) {
        input(name).max=q-1;
        input(name).value=Math.min(value(name),q-1);
      }
      const modes=input("connection");
      modes.querySelector('[value="flat"]').disabled=model.generators.length===0;
      modes.querySelector('[value="local"]').disabled=!model.localEdge;
      modes.querySelector('[value="flat-local"]').disabled=!model.localEdge || model.generators.length===0;
      if (modes.selectedOptions[0].disabled) modes.value="zero";
      input("period").replaceChildren(...model.generators.map((_,i)=>new Option("Period "+(i+1),i)));
      const prior=input("measure").value;
      input("measure").replaceChildren(new Option("All charges","total"),...model.roots.map((_,k)=>new Option("Charge "+k,k)));
      input("measure").value=input("measure").querySelector('[value="'+prior+'"]') ? prior : "total";
      input("time").max=lastFrame;
      reset();
      playLoop();
    }

    function snapshot(face,opposite,u,v) {
      if (!model) return null;
      selectedArc=model.arcIds[u*model.n+v];
      const t=value("time");
      const raw=frame(t);
      const potential=Array.from({length:model.n},(_,i)=>value("gauge")*(3*i*i-i));
      const shown=gauge.gaugeState(model,raw,potential);
      const shownField=gauge.gaugeField(model,field,potential);
      const densities=gauge.densities(model,shown);
      const moved=gauge.step(model,shown,shownField,input("operator").value==="coin");
      const reference=gauge.gaugeState(model,frame(t+1),potential);
      let gaugeError=0;
      for(let i=0;i<moved.length;i++) gaugeError=Math.max(gaugeError,Math.abs(moved[i]-reference[i]));
      const measure=input("measure").value;
      const population=densities.byVertex.map(parts=>measure==="total" ? parts.reduce((a,b)=>a+b,0) : parts[Number(measure)]);
      const nonzeroFaces=flux.faces.filter(Boolean).length;
      const nonzeroPeriods=flux.periods.filter(Boolean).length;
      const {sign,edge}=model.arcs[selectedArc];
      const linked=gauge.mod(sign*shownField[edge],model.q);
      const origin=model.arcs[initialArc];
      tell("clock","Step "+t+" of "+lastFrame+" · Start "+origin.u+" → "+origin.v);
      tell("invariants","Norm "+densities.norm.toFixed(9)+" · Gauge residual "+gaugeError.toExponential(1));
      tell("flux","Face "+(face+1)+" exponent "+flux.faces[face]+" · Reverse face "+(opposite+1)+
        " exponent "+flux.faces[opposite]+" · "+nonzeroFaces+" nonzero face exponents · "+nonzeroPeriods+
        " nonzero periods (mod "+model.q+").");
      tell("link","Selected dart exponent "+linked+" (mod "+model.q+") in this vertex frame.");
      const charge=measure==="total"?1:Number(measure);
      const start=2*(selectedArc*model.q+charge);
      const shiftedIndex=model.shift[selectedArc];
      const finish=2*(shiftedIndex*model.q+charge);
      const movedArc=model.arcs[shiftedIndex];
      const useCoin=input("operator").value==="coin";
      const mixed=useCoin ? gauge.vertexCoin(model,shown) : shown;
      const format=(values,offset)=>{
        const real=values[offset], imaginary=values[offset+1];
        return real.toFixed(5)+(imaginary<0?" − ":" + ")+Math.abs(imaginary).toFixed(5)+"i";
      };
      tell("trace","Charge "+charge+" · input "+format(shown,start)+(useCoin?" · after coin ":" · after identity ")+format(mixed,start)+
        " · × ω^"+gauge.mod(charge*linked,model.q)+" · output "+format(moved,finish)+
        " at "+movedArc.u+" → "+movedArc.v+".");
      tell("masses",population.map((mass,i)=>i+"  "+mass.toFixed(6)).join("\n"));
      return {population,color:measure==="total"?"blue":"violet"};
    }

    input("radix").addEventListener("change",()=>{setup(map);redraw();});
    for(const name of ["connection","period","operator","exponent"]) input(name).addEventListener("input",()=>{
      reset();
      redraw();
    });
    for(const name of ["gauge","measure"]) input(name).addEventListener("input",redraw);
    input("speed").addEventListener("change",playLoop);
    input("play").addEventListener("click",()=>{playing=!playing;playLoop();});
    input("time").addEventListener("input",()=>{playing=false;playLoop();redraw();});
    input("start").addEventListener("click",()=>{initialArc=selectedArc;reset();redraw();});
    input("inspect").addEventListener("click",()=>{
      const edge=input("connection").value==="flat" ? model.generators[value("period")] : model.localEdge.edge;
      const [u,v]=model.edges[edge];
      const target=map.dartLocations.get(u*model.n+v);
      selectFace(target.face,target.index);
    });
    details.addEventListener("toggle",playLoop);
    return {setup,snapshot};
  }

  return {bind};
})();
