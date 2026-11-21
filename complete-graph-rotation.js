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
    9: {
      minimum: [
        [1,4,8,7,2,3,6,5],
        [0,2,8,6,3,5,7,4],
        [0,7,6,4,5,8,1,3],
        [0,2,4,7,8,5,1,6],
        [0,1,7,3,5,2,6,8],
        [0,6,7,1,3,8,2,4],
        [0,3,1,8,4,2,7,5],
        [0,8,3,4,1,5,6,2],
        [0,4,6,1,2,5,3,7],
      ],
      maximum: [
        [1,2,3,7,8,4,6,5],
        [0,3,2,8,7,4,5,6],
        [0,1,8,3,7,4,6,5],
        [0,6,8,7,2,4,5,1],
        [0,7,8,1,2,3,6,5],
        [0,4,2,1,8,6,7,3],
        [0,4,3,7,2,1,8,5],
        [0,8,5,6,3,2,1,4],
        [0,3,4,6,5,7,1,2],
      ],
    },
    10: {
      minimum: [
        [1,4,6,2,7,9,3,8,5],
        [0,2,6,5,9,8,7,3,4],
        [0,6,1,3,9,5,8,4,7],
        [0,9,2,4,1,7,5,6,8],
        [0,1,3,5,7,2,8,9,6],
        [0,8,2,9,1,6,3,7,4],
        [0,4,9,7,8,3,5,1,2],
        [0,2,4,5,3,1,8,6,9],
        [0,3,6,7,1,9,4,2,5],
        [0,7,6,4,8,1,5,2,3],
      ],
      maximum: [
        [1,4,3,6,5,2,9,8,7],
        [0,9,7,3,2,5,8,4,6],
        [0,5,4,9,3,6,8,1,7],
        [0,1,9,4,8,2,6,5,7],
        [0,7,6,8,5,2,3,9,1],
        [0,2,8,3,7,9,6,4,1],
        [0,3,2,5,9,1,8,7,4],
        [0,5,6,4,1,9,3,8,2],
        [0,4,5,3,1,2,6,9,7],
        [0,4,2,5,3,7,8,6,1],
      ],
    },
    11: {
      minimum: [
        [1,10,8,4,2,9,7,5,3,6],
        [0,6,4,8,5,9,3,7,2,10],
        [0,4,10,1,7,6,5,8,3,9],
        [0,5,10,4,7,1,9,2,8,6],
        [0,8,1,6,9,5,7,3,10,2],
        [0,7,4,9,1,8,2,6,10,3],
        [0,3,8,10,5,2,7,9,4,1],
        [0,10,8,9,6,2,1,3,4,5],
        [0,9,7,10,6,3,2,5,1,4],
        [8,10,0,2,3,1,5,4,6,7],
        [7,9,0,1,2,4,3,5,6,8],
      ],
      maximum: [
        [1,2,10,3,8,6,4,7,9,5],
        [0,2,3,8,6,5,7,4,10,9],
        [0,7,9,3,1,5,6,4,10,8],
        [0,6,5,1,4,10,9,8,7,2],
        [0,5,1,2,8,9,7,6,10,3],
        [0,10,1,8,7,2,3,6,9,4],
        [0,10,9,3,8,5,2,1,7,4],
        [0,9,10,3,1,8,6,5,2,4],
        [0,5,7,6,1,10,3,9,4,2],
        [0,7,6,10,2,3,8,4,1,5],
        [0,2,8,1,4,6,3,5,9,7],
      ],
    },
    12: {
      minimum: [
        [1,3,5,8,10,6,4,11,7,9,2],
        [2,6,7,10,4,9,8,5,11,3,0],
        [0,9,11,4,8,3,10,7,5,6,1],
        [5,0,1,11,6,10,2,8,9,7,4],
        [3,7,8,2,11,0,6,9,1,10,5],
        [4,10,9,6,2,7,11,1,8,0,3],
        [7,1,2,5,9,4,0,10,3,11,8],
        [8,4,3,9,0,11,5,2,10,1,6],
        [6,11,10,0,5,1,9,3,2,4,7],
        [11,2,0,7,3,8,1,4,6,5,10],
        [9,5,4,1,7,2,3,6,0,8,11],
        [10,8,6,3,1,5,7,0,4,2,9],
      ],
      maximum: [
        [1,9,11,4,5,10,8,2,7,3,6],
        [0,10,8,7,3,9,5,2,6,11,4],
        [0,3,9,4,5,8,7,10,11,6,1],
        [0,10,9,5,1,2,6,7,11,4,8],
        [0,5,6,1,10,8,7,2,9,11,3],
        [0,2,9,11,1,3,10,6,7,4,8],
        [0,10,7,1,8,4,5,11,9,3,2],
        [0,10,6,4,3,5,2,8,1,11,9],
        [0,6,1,4,3,7,2,9,10,5,11],
        [0,8,1,7,2,3,6,4,5,10,11],
        [0,5,4,2,11,9,3,8,1,6,7],
        [0,7,10,4,9,1,8,2,5,3,6],
      ],
    },
    13: {
      minimum: [
        [1,4,7,10,2,5,8,11,3,6,9,12],
        [0,12,7,5,9,8,10,3,2,11,6,4],
        [0,10,8,6,7,9,11,1,3,12,4,5],
        [0,11,9,4,8,7,12,2,1,10,5,6],
        [0,1,2,12,8,3,9,6,10,11,5,7],
        [0,2,3,10,9,1,7,4,11,12,6,8],
        [0,3,1,11,7,2,8,5,12,10,4,9],
        [0,4,5,1,12,3,8,9,2,6,11,10],
        [0,5,6,2,10,1,9,7,3,4,12,11],
        [0,6,4,3,11,2,7,8,1,5,10,12],
        [0,7,11,4,6,12,9,5,3,1,8,2],
        [0,8,12,5,4,10,7,6,1,2,9,3],
        [0,9,10,6,5,11,8,4,2,3,7,1],
      ],
      maximum: [
        [1,6,12,5,2,10,4,3,9,7,8,11],
        [0,6,11,2,9,3,7,10,4,8,12,5],
        [0,8,12,7,5,4,6,3,11,9,1,10],
        [0,8,7,2,10,11,1,5,4,6,9,12],
        [0,8,7,2,3,11,9,6,12,10,5,1],
        [0,1,10,9,6,11,8,7,4,12,3,2],
        [0,7,10,9,2,11,12,1,4,5,3,8],
        [0,2,9,1,6,3,4,8,10,5,11,12],
        [0,12,4,9,1,11,3,2,7,5,6,10],
        [0,7,12,6,8,3,1,5,4,2,11,10],
        [0,8,3,7,5,4,12,9,11,6,2,1],
        [0,10,6,1,3,8,12,4,7,2,5,9],
        [0,4,2,3,9,1,10,8,11,5,6,7],
      ],
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
    const visited = new Map(), faces = [], edges = [];
    for (let u=0; u<n; u++) {
      for (let v=0; v<n; v++) {
        if (u<v) edges.push([u,v]);
        if (u===v || visited.has(u*n+v)) continue;
        const face = [];
        let a=u, b=v;
        do {
          const dart=a*n+b;
          if (visited.has(dart)) throw Error("A face walk entered another orbit");
          visited.set(dart, {face:faces.length,index:face.length});
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
    return {n, dartLocations:visited, rotation:rotation.map(row=>row.slice()), faces, edges, darts, chi, genus,
            minimumGenus, maximumGenus, faceSizes:faces.map(f=>f.length).sort((a,b)=>a-b)};
  }

  function dartStep(map, faceIndex, index) {
    const face=map.faces[faceIndex];
    if (!face || !Number.isInteger(index) || index<0 || index>=face.length) {
      throw RangeError("Choose a dart on the selected face");
    }
    const u=face[index], v=face[(index+1)%face.length];
    const opposite=map.dartLocations.get(v*map.n+u);
    return {u,v,next:face[(index+2)%face.length],opposite:{...opposite}};
  }

  function certificate(n, extremum="minimum") {
    if (!Number.isInteger(n) || !Object.hasOwn(rotations,n) || !["minimum","maximum"].includes(extremum)) {
      throw RangeError("Choose K3 through K13 and minimum or maximum");
    }
    const result=verify(rotations[n][extremum]);
    // F <= 2E/3 for a simple complete graph of order >= 3; F >= 1 for a cellular map.
    // Each exhibited rotation reaches the corresponding rounded Euler bound.
    if (result.genus!==result[extremum+"Genus"]) throw Error("Certificate misses its genus bound");
    return {...result,extremum};
  }

  return Object.freeze({certificate,verify,dartStep,supported:Object.freeze(Object.keys(rotations).map(Number))});
})();
if (typeof module !== "undefined") module.exports = CompleteGraphRotation;
if (typeof window !== "undefined") window.CompleteGraphRotation = CompleteGraphRotation;
