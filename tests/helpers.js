/* Reads a binary STL and checks that it is a closed solid: every edge must appear exactly once in
   each direction. Also returns the enclosed volume.
   Vertices are matched by their exact bit pattern through a small open-addressing hash table, and
   edges are keyed by a pair of vertex ids packed into one number. Building string keys instead made
   this take several seconds on a 300k-triangle mesh. */
export function inspectSTL(stl) {
  const dv = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const n = dv.getUint32(80, true);

  let tableSize = 16;
  while (tableSize < n * 6) tableSize *= 2;
  const mask = tableSize - 1;
  const table = new Int32Array(tableSize).fill(-1);
  const vx = new Uint32Array(n * 3), vy = new Uint32Array(n * 3), vz = new Uint32Array(n * 3);
  let vertexCount = 0;
  const vertexId = (o) => {
    const x = dv.getUint32(o, true), y = dv.getUint32(o + 4, true), z = dv.getUint32(o + 8, true);
    let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(z, 0xc2b2ae35)) & mask;
    for (;;) {
      const id = table[h];
      if (id < 0) {
        table[h] = vertexCount; vx[vertexCount] = x; vy[vertexCount] = y; vz[vertexCount] = z;
        return vertexCount++;
      }
      if (vx[id] === x && vy[id] === y && vz[id] === z) return id;
      h = (h + 1) & mask;
    }
  };

  const corners = new Int32Array(n * 3);
  let volume = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 3; k++) corners[t * 3 + k] = vertexId(o + k * 12);
    const ax = dv.getFloat32(o, true), ay = dv.getFloat32(o + 4, true), az = dv.getFloat32(o + 8, true);
    const bx = dv.getFloat32(o + 12, true), by = dv.getFloat32(o + 16, true), bz = dv.getFloat32(o + 20, true);
    const cx = dv.getFloat32(o + 24, true), cy = dv.getFloat32(o + 28, true), cz = dv.getFloat32(o + 32, true);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }

  const edges = new Map();
  let degenerate = 0;
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const a = corners[t * 3 + k], b = corners[t * 3 + ((k + 1) % 3)];
      if (a === b) { degenerate++; continue; }
      const e = a * vertexCount + b;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let openEdges = 0;
  for (const [e, count] of edges) {
    const a = Math.floor(e / vertexCount), b = e % vertexCount;
    if (count !== 1 || edges.get(b * vertexCount + a) !== 1) openEdges++;
  }
  return { triangles: n, vertices: vertexCount, openEdges, degenerate, volume, sizeOk: stl.length === 84 + n * 50 };
}

/* Minimum gap between the inner face of a cap and the threaded neck, with the cap fully seated and
   turned to the thread's phase. */
export function capClearance(G, q, cap) {
  const bottom = cap.which === 'bottom';
  let min = Infinity, engage = 0;
  for (let zi = 0; zi <= cap.L * 20; zi++) {
    const d = zi / 20;                                   // distance from the free end of the neck
    const br = G.bodyRow(q, bottom ? d : q.H - d);
    const cr = G.capRow(q, cap, d + cap.floor);
    for (let ti = 0; ti < 180; ti++) {
      const th = (G.TAU * ti) / 180;
      const male = G.bodyR(q, br, th);
      const inner = G.capR(q, cap, cr, cr.ph - (br.ph - th));
      min = Math.min(min, inner - male);
      engage = Math.max(engage, male - (cap.R - cap.dep + q.c));
    }
  }
  return { min, engage };
}
