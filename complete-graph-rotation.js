"use strict";

// Orientable ribbon convention: face step (u,v) -> (v, successor at v of u).
// All vertices have one cyclic link. Each unordered pair is one untwisted ribbon.
// K7 uses a cyclic triangular rotation. K8 minimum was constructed by covering the
// darts with 16 oriented triangles and two quadrilaterals, retaining one link per vertex.
// See Timothy Sun, Face distributions of embeddings of complete graphs,
// https://arxiv.org/abs/1708.02092 (the exceptional K8 face distribution).
const CompleteGraphRotation = (() => {
  const rotations = {
    3: {
      minimum: [[1,2],[0,2],[0,1]],
      maximum: [[1,2],[0,2],[0,1]],
    },
    4: {
      minimum: [[1,3,2],[0,2,3],[0,3,1],[0,1,2]],
      maximum: [[1,2,3],[0,2,3],[0,3,1],[0,2,1]],
    },
    5: {
      minimum: [[1,2,4,3],[0,4,2,3],[0,3,4,1],[0,2,1,4],[0,1,3,2]],
      maximum: [[1,2,4,3],[0,3,2,4],[0,3,1,4],[0,4,1,2],[0,3,2,1]],
    },
    6: {
      minimum: [[1,3,2,4,5],[0,5,2,4,3],[0,3,5,4,1],[0,1,4,5,2],[0,3,1,2,5],[0,4,2,3,1]],
      maximum: [[1,3,4,5,2],[0,5,2,4,3],[0,5,3,4,1],[0,5,4,2,1],[0,2,1,5,3],[0,2,1,3,4]],
    },
    7: {
      minimum: [[1,3,2,6,4,5],[0,5,6,2,4,3],[0,3,5,4,1,6],[0,1,4,6,5,2],[0,6,3,1,2,5],[0,4,2,3,6,1],[0,2,1,5,3,4]],
      maximum: [[1,4,5,6,3,2],[0,6,4,3,5,2],[0,6,1,3,5,4],[0,5,1,6,2,4],[0,3,5,2,6,1],[0,6,3,1,4,2],[0,4,5,3,1,2]],
    },
    8: {
      minimum: [[1,5,4,6,2,7,3],[0,2,6,3,7,4,5],[0,6,1,3,4,5,7],[0,7,1,6,5,4,2],[0,2,3,5,1,7,6],[0,1,4,3,6,7,2],[0,4,7,5,3,1,2],[0,2,5,6,4,1,3]],
      maximum: [[1,5,3,2,7,6,4],[0,3,5,7,6,4,2],[0,7,5,1,3,6,4],[0,5,7,2,4,6,1],[0,3,2,7,5,1,6],[0,7,6,2,4,1,3],[0,1,7,4,2,3,5],[0,4,1,5,3,6,2]],
    },
  };
  function verify(rotation) {
    if (!Array.isArray(rotation) || rotation.length < 3) throw Error("Expected a rotation for K_n with n ≥ 3");
    const n = rotation.length;
    const next = rotation.map((neighbors, v) => {
      if (!Array.isArray(neighbors) || neighbors.length !== n-1 || new Set(neighbors).size !== n-1 ||
          neighbors.some(w => !Number.isInteger(w) || w < 0 || w >= n || w === v)) {
        throw Error("Every vertex link must list each other vertex exactly once");
      }
      return new Map(neighbors.map((w,i) => [w, neighbors[(i+1)%neighbors.length]]));
    });
    const visited = new Set(), faces = [], edges = [];
    for (let u=0; u<n; u++) {
      for (let v=0; v<n; v++) {
        if (u<v) edges.push([u,v]);
        if (u===v || visited.has(u*n+v)) continue;
        const face = [];
        let a=u, b=v;
        do {
          const dart=a*n+b;
          if (visited.has(dart)) throw Error("A face walk entered another orbit");
          visited.add(dart);
          face.push(a);
          [a,b]=[b,next[b].get(a)];
        } while (a!==u || b!==v);
        faces.push(face);
      }
    }
    const darts=visited.size;
    const chi=n-edges.length+faces.length, genus=(2-chi)/2;
    if (darts!==2*edges.length || !Number.isInteger(genus) || genus<0) throw Error("Invalid closed orientable map");
    const minimumGenus=Math.ceil((n-3)*(n-4)/12);
    const maximumGenus=Math.floor((edges.length-n+1)/2);
    return {n, rotation:rotation.map(row=>row.slice()), faces, edges, darts, chi, genus,
            minimumGenus, maximumGenus, faceSizes:faces.map(f=>f.length).sort((a,b)=>a-b)};
  }

  function certificate(n, extremum="minimum") {
    if (!Number.isInteger(n) || !Object.hasOwn(rotations,n) || !["minimum","maximum"].includes(extremum)) {
      throw RangeError("Choose K3 through K8 and minimum or maximum");
    }
    const result=verify(rotations[n][extremum]);
    // F <= 2E/3 for a simple complete graph of order >= 3; F >= 1 for a cellular map.
    // Each exhibited rotation reaches the corresponding rounded Euler bound.
    if (result.genus!==result[extremum+"Genus"]) throw Error("Certificate misses its genus bound");
    return {...result,extremum};
  }

  return Object.freeze({certificate,verify,supported:Object.freeze([3,4,5,6,7,8])});
})();
if (typeof module !== "undefined") module.exports = CompleteGraphRotation;
if (typeof window !== "undefined") window.CompleteGraphRotation = CompleteGraphRotation;
