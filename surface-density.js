"use strict";

const SurfaceDensity = (() => {
  const probability = ([re,im]) => re*re+im*im;
  const norm = state => state.reduce((sum,vertex)=>sum+vertex.reduce((s,amp)=>s+probability(amp),0),0);
  function initialize(vertices, anchor, gauge, spread) {
    const weights=vertices.map(position=>Math.exp(-position.reduce((sum,x,i)=>sum+(x-anchor[i])**2,0)/(2*spread*spread)));
    const scale=Math.sqrt(weights.reduce((sum,w)=>sum+w*w,0));
    return weights.map((w,i)=>[1,-1,0].map((charge,k)=>{
      const p=gauge(vertices[i])*charge;
      const magnitude=w*Math.sqrt([.6,.3,.1][k])/scale;
      return [magnitude*Math.cos(p),magnitude*Math.sin(p)];
    }));
  }
  function gaugeChange(state, vertices, delta) {
    return state.map((v,i)=>v.map(([r,m],k)=>{
      const x=[1,-1,0][k]*delta(vertices[i]), c=Math.cos(x), s=Math.sin(x);
      return [r*c-m*s,r*s+m*c];
    }));
  }
  function step(state, edges, phase, mixing) {
    // Each pair is updated by [c I, -s U†; s U, c I], a unitary block on the six amplitudes.
    const next=state.map(v=>v.map(amp=>[...amp]));
    const c=Math.cos(mixing), s=Math.sin(mixing);
    edges.forEach(([a,b])=>{
      const angle=phase(a,b);
      for(let k=0;k<3;k++) {
        const argument=k===0?angle:k===1?-angle:0;
        const x=Math.cos(argument), y=Math.sin(argument);
        const [ar,ai]=next[a][k], [br,bi]=next[b][k];
        next[a][k]=[c*ar-s*(x*br+y*bi),c*ai-s*(x*bi-y*br)];
        next[b][k]=[c*br+s*(x*ar-y*ai),c*bi+s*(x*ai+y*ar)];
      }
    });
    return next;
  }
  const densities = state => state.map(channels=>channels.map(probability));
  return {initialize,gaugeChange,step,densities,norm};
})();
if (typeof module !== "undefined") module.exports=SurfaceDensity;
