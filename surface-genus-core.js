"use strict";

const SurfaceGenus = (() => {
  const MAX_GENUS = 8;
  const edgeKey = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const require = (condition,message) => { if (!condition) throw new Error(message); };

  function verify(mesh) {
    const {vertices,edges,faces,handles} = mesh;
    const incidence = new Map();
    const links = vertices.map(() => new Map());
    const adjacent = vertices.map(() => []);
    for (const face of faces) {
      require(face.length === 4 && new Set(face).size === 4,"Expected an oriented quadrilateral");
      face.forEach((a,i) => {
        require(Number.isInteger(a) && a >= 0 && a < vertices.length,"Face vertex is outside the mesh");
        const b = face[(i+1)%4], c = face[(i+3)%4], key = edgeKey(a,b);
        if (!incidence.has(key)) incidence.set(key,[]);
        incidence.get(key).push([a,b]);
        require(!links[a].has(c),"An oriented vertex link has repeated predecessors");
        links[a].set(c,b);
      });
    }
    require(new Set(edges.map(edge => edgeKey(...edge))).size === incidence.size &&
      edges.length === incidence.size && edges.every(edge => incidence.has(edgeKey(...edge))),
      "Edge list does not agree with the face boundaries");
    for (const entries of incidence.values()) {
      require(entries.length === 2,"Each edge must have exactly two incident faces");
      const [[a,b],[otherB,otherA]] = entries;
      require(a === otherA && b === otherB,"Incident faces traverse an edge in opposite directions");
      require(vertices[a].reduce((sum,value,i) => sum + Math.abs(value-vertices[b][i]),0) === 1,
        "Every boundary edge must be a unit lattice segment");
      adjacent[a].push(b);
      adjacent[b].push(a);
    }
    const cyclicLinks = links.map(link => {
      require(link.size >= 3,"Vertex link has fewer than three neighbors");
      const start = link.keys().next().value;
      const cycle = [];
      let current = start;
      do {
        require(link.has(current) && cycle.length < link.size,"Vertex link does not close");
        cycle.push(current);
        current = link.get(current);
      } while (current !== start);
      require(cycle.length === link.size,"Vertex has more than one incident face cycle");
      return cycle;
    });
    const connected = new Set([0]);
    const queue = [0];
    for (let i = 0; i < queue.length; i++) {
      adjacent[queue[i]].forEach(id => {
        if (!connected.has(id)) { connected.add(id); queue.push(id); }
      });
    }
    require(connected.size === vertices.length,"Mesh is disconnected");
    const chi = vertices.length-edges.length+faces.length;
    const genus = (2-chi)/2;
    require(Number.isInteger(genus) && genus === handles.length,"Euler characteristic does not match handle count");
    const previousHandles = new Set();
    const intersections = handles.map(({meridian,longitude}) => {
      for (const cycle of [meridian,longitude]) {
        require(cycle.length >= 4 && new Set(cycle).size === cycle.length,"Handle cycle is not simple");
        require(!cycle.some(id => previousHandles.has(id)),"Handle cycles of different holes share a vertex");
        require(cycle.every((id,i) => incidence.has(edgeKey(id,cycle[(i+1)%cycle.length]))),
          "A handle cycle is not closed along mesh edges");
      }
      const shared = meridian.filter(id => longitude.includes(id));
      require(shared.length === 1,"Handle cycles must meet exactly once");
      const vertex = shared[0];
      const around = cyclicLinks[vertex];
      const at = cycle => {
        const i = cycle.indexOf(vertex);
        return [cycle[(i+cycle.length-1)%cycle.length],cycle[(i+1)%cycle.length]];
      };
      const [meridianPrev,meridianNext] = at(meridian);
      const longitudeEnds = at(longitude);
      const mid = around.indexOf(meridianPrev);
      const rotated = around.slice(mid).concat(around.slice(0,mid));
      const wedge = rotated.slice(1,rotated.indexOf(meridianNext));
      require(longitudeEnds.filter(neighbor => wedge.includes(neighbor)).length === 1,
        "Handle cycles touch without crossing in the oriented vertex link");
      [...meridian,...longitude].forEach(id => previousHandles.add(id));
      return wedge.includes(longitudeEnds[1]) ? 1 : -1;
    });
    return {vertices:vertices.length,edges:edges.length,faces:faces.length,chi,genus,intersections};
  }

  function build(genus) {
    require(Number.isInteger(genus) && genus >= 0 && genus <= MAX_GENUS,"Genus must be an integer from 0 to 8");
    const columns = Math.ceil(Math.sqrt(Math.max(1,genus)));
    const rows = Math.ceil(Math.max(1,genus)/columns);
    const pitch = 2*rows+2;
    const width = (columns-1)*pitch+(rows-1)*2+5;
    const height = (rows-1)*pitch+5;
    const holes = Array.from({length:genus},(_,i) => {
      const row = Math.floor(i/columns);
      return {x:2+(i%columns)*pitch+row*2,y:2+row*pitch};
    });
    const removed = new Set(holes.map(({x,y}) => `${x}:${y}`));
    const inside = (x,y) => x >= 0 && x < width && y >= 0 && y < height && !removed.has(`${x}:${y}`);
    const vertices = [], faces = [];
    const ids = new Map(), edgeMap = new Map();
    function vertex(x,y,z) {
      const key = `${x}:${y}:${z}`;
      if (!ids.has(key)) { ids.set(key,vertices.length); vertices.push([x,y,z]); }
      return ids.get(key);
    }
    function face(cycle) {
      faces.push(cycle);
      cycle.forEach((a,i) => {
        const b = cycle[(i+1)%cycle.length];
        edgeMap.set(edgeKey(a,b),a < b ? [a,b] : [b,a]);
      });
    }
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
      if (!inside(x,y)) continue;
      const corners = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
      const top = corners.map(point => vertex(...point,1));
      const bottom = corners.map(point => vertex(...point,0));
      face(top);
      face([...bottom].reverse());
      const neighbors = [[x,y-1],[x+1,y],[x,y+1],[x-1,y]];
      neighbors.forEach(([nx,ny],i) => {
        if (inside(nx,ny)) return;
        const j = (i+1)%4;
        face([top[j],top[i],bottom[i],bottom[j]]);
      });
    }
    const handles = holes.map(({x,y},i) => {
      const meridian = [vertex(x,y,1),vertex(x+1,y,1),vertex(x+1,y+1,1),vertex(x,y+1,1)];
      const longitude = [];
      longitude.push(vertex(x,y,1));
      for (let j = y; j >= 0; j--) longitude.push(vertex(x,j,0));
      for (let j = 0; j < y; j++) longitude.push(vertex(x,j,1));
      return {id:i+1,center:[x+.5,y+.5],bounds:[x,y,x+1,y+1],meridian,longitude};
    });
    const mesh = {vertices,edges:[...edgeMap.values()],faces,handles,width,height};
    const report = verify(mesh);
    require(report.intersections.every(sign => sign === 1),"Canonical handle orientation has incorrect intersection sign");
    return {...mesh,genus:report.genus,chi:report.chi,intersections:report.intersections};
  }

  function cleanDessin(mesh) {
    const vertices = mesh.vertices.map(point => [...point]);
    const white = new Map(), edges = [];
    for (const [a,b] of mesh.edges) {
      const midpoint = vertices.length;
      white.set(edgeKey(a,b),midpoint);
      vertices.push(mesh.vertices[a].map((value,i) => (value+mesh.vertices[b][i])/2));
      edges.push([a,midpoint],[b,midpoint]);
    }
    const faces = mesh.faces.map(cycle => cycle.flatMap((a,i) => [a,white.get(edgeKey(a,cycle[(i+1)%cycle.length]))]));
    const colors = vertices.map((_,i) => i < mesh.vertices.length ? "black" : "white");
    return {vertices,edges,faces,colors,genus:mesh.genus,chi:mesh.chi};
  }

  return Object.freeze({build,verify,cleanDessin,MAX_GENUS});
})();

if (typeof module !== "undefined" && module.exports) module.exports = SurfaceGenus;
