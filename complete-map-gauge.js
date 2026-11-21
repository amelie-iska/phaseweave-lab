"use strict";

const CompleteMapGauge = (() => {
  const radices=Object.freeze([2,3,5,7]);
  const mod=(x,q)=>((x%q)+q)%q;

  function topology(map) {
    const {n,edges,faces,genus,dartLocations}=map;
    const arcs=[];
    const arcIds=new Int16Array(n*n).fill(-1);
    const adjacent=Array.from({length:faces.length},()=>[]);
    const components=faces.map((_,i)=>i);
    const root=face=>{
      while (components[face]!==face) face=components[face];
      return face;
    };
    const generators=[], cotree=[];
    for (const [edge,[u,v]] of edges.entries()) {
      const positive=dartLocations.get(u*n+v).face;
      const negative=dartLocations.get(v*n+u).face;
      arcIds[u*n+v]=arcs.push({u,v,edge,sign:1})-1;
      arcIds[v*n+u]=arcs.push({u:v,v:u,edge,sign:-1})-1;
      // The canonical edge order first selects the primal star at vertex zero.
      if (u===0) continue;
      const a=root(positive), b=root(negative);
      if (a===b) {
        generators.push(edge);
      } else {
        components[b]=a;
        cotree.push({edge,positive,negative});
        adjacent[negative].push({face:positive,edge,sign:1});
        adjacent[positive].push({face:negative,edge,sign:-1});
      }
    }
    const faceArcs=faces.map(walk=>walk.map((u,i)=>arcIds[u*n+walk[(i+1)%walk.length]]));
    const shift=new Int16Array(arcs.length).fill(-1);
    for (const group of faceArcs) {
      group.forEach((arc,i)=>{ shift[arc]=group[(i+1)%group.length]; });
    }
    const parents=[{face:0}], seenFaces=new Set([0]);
    for (const current of parents) {
      for (const other of adjacent[current.face]) {
        if (seenFaces.has(other.face)) continue;
        seenFaces.add(other.face);
        parents.push({...other,parent:current.face});
      }
    }
    if (parents.length!==faces.length || generators.length!==2*genus || shift.includes(-1) ||
        new Set(shift).size!==arcs.length) throw Error("Invalid complete-map transport topology");
    const periodArcs=generators.map(edge=>{
      const [u,v]=edges[edge];
      return [arcIds[u*n+v],arcIds[v*n],arcIds[u]];
    });
    return {n,edges,arcs,arcIds,faceArcs,periodArcs,shift,parents,generators,localEdge:cotree[0]??null};
  }

  const walkSum=(model,field,walk)=>walk.reduce((sum,arc)=>{
    const {edge,sign}=model.arcs[arc];
    return sum+sign*field[edge];
  },0);
  const exponents=(model,field)=>({
    faces:model.faceArcs.map(walk=>mod(walkSum(model,field,walk),model.q)),
    periods:model.periodArcs.map(walk=>mod(walkSum(model,field,walk),model.q)),
  });

  function connection(model,mode,amount,period=0) {
    if (!Number.isInteger(amount) || !["zero","flat","local","flat-local"].includes(mode)) {
      throw RangeError("Choose an integral connection");
    }
    const field=model.edges.map(()=>0);
    if (mode==="flat" || mode==="flat-local") {
      const edge=model.generators[period];
      if (edge===undefined) throw RangeError("No such global period");
      field[edge]=amount;
      const flux=model.faceArcs.map(walk=>walkSum(model,field,walk));
      for (let i=model.parents.length-1;i>0;i--) {
        const {face,parent,edge,sign}=model.parents[i];
        field[edge]-=sign*flux[face];
        flux[parent]+=flux[face];
      }
    }
    if (mode==="local" || mode==="flat-local") {
      if (!model.localEdge) throw RangeError("Local flux requires two distinct faces");
      field[model.localEdge.edge]+=amount;
    }
    return field;
  }

  function create(map,q) {
    if (!radices.includes(q)) throw RangeError("Unsupported radix");
    const roots=Array.from({length:q},(_,i)=>{
      const angle=2*Math.PI*i/q;
      return [Math.cos(angle),Math.sin(angle)];
    });
    return {...topology(map),q,roots};
  }

  function basisState(model,arc) {
    if (!model.arcs[arc]) throw RangeError("Choose an existing directed edge");
    const state=new Float64Array(2*model.arcs.length*model.q);
    const value=1/Math.sqrt(model.q);
    for(let k=0;k<model.q;k++) state[2*(arc*model.q+k)]=value;
    return state;
  }

  function transform(model,state,factor) {
    const {arcs,q,roots}=model, output=new Float64Array(state.length);
    for(const [i,arc] of arcs.entries()) for(let k=0;k<q;k++) {
      const j=2*(i*q+k);
      const [c,s]=roots[mod(k*factor(arc),q)];
      output[j]=c*state[j]-s*state[j+1];
      output[j+1]=s*state[j]+c*state[j+1];
    }
    return output;
  }

  function vertexCoin(model,state) {
    const {n,arcs,q}=model;
    const sums=new Float64Array(2*n*q);
    for (const [i,{u}] of arcs.entries()) for(let k=0;k<2*q;k++) sums[2*u*q+k]+=state[2*i*q+k];
    const output=new Float64Array(state.length);
    for(const [i,{u}] of arcs.entries()) for(let k=0;k<2*q;k++) {
      output[2*i*q+k]=2*sums[2*u*q+k]/(n-1)-state[2*i*q+k];
    }
    return output;
  }

  function step(model,state,field,useCoin) {
    const mixed=useCoin ? vertexCoin(model,state) : state;
    const phased=transform(model,mixed,({edge,sign})=>sign*field[edge]);
    const next=new Float64Array(state.length), stride=2*model.q;
    for(const [i,j] of model.shift.entries()) next.set(phased.subarray(i*stride,(i+1)*stride),j*stride);
    return next;
  }

  const gaugeState=(model,state,potential)=>transform(model,state,({u})=>potential[u]);
  const gaugeField=(model,field,potential)=>model.edges.map(([u,v],i)=>field[i]+potential[v]-potential[u]);

  function densities(model,state) {
    const {n,q,arcs}=model;
    const byVertex=Array.from({length:n},()=>Array(q).fill(0));
    let norm=0;
    for(const [i,{u}] of arcs.entries()) for(let k=0;k<q;k++) {
      const j=2*(i*q+k), density=state[j]**2+state[j+1]**2;
      byVertex[u][k]+=density;
      norm+=density;
    }
    return {byVertex,norm};
  }

  return {radices,create,exponents,connection,step,basisState,vertexCoin,gaugeState,gaugeField,densities,mod};
})();
if (typeof module !== "undefined") module.exports=CompleteMapGauge;
if (typeof window !== "undefined") window.CompleteMapGauge=CompleteMapGauge;
