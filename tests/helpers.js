/* Reads a binary STL and checks that it is a closed solid: every edge must appear exactly once in
   each direction. Also returns the enclosed volume.
   Vertices are matched by their exact bit pattern through a small open-addressing hash table, and
   edges are keyed by a pair of vertex ids packed into one number. Building string keys instead made
   this take several seconds on a 300k-triangle mesh. */
export function inspectSTL(stl) {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const triangles = view.getUint32(80, true);

  let tableSize = 16;
  while (tableSize < triangles * 6) tableSize *= 2;
  const mask = tableSize - 1;
  const table = new Int32Array(tableSize).fill(-1);
  const xBits = new Uint32Array(triangles * 3), yBits = new Uint32Array(triangles * 3), zBits = new Uint32Array(triangles * 3);
  let vertexCount = 0;
  /* Id of the vertex stored at byte `offset`, adding it the first time it shows up. */
  const vertexId = (offset) => {
    const x = view.getUint32(offset, true), y = view.getUint32(offset + 4, true), z = view.getUint32(offset + 8, true);
    let slot = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(z, 0xc2b2ae35)) & mask;
    for (;;) {
      const id = table[slot];
      if (id < 0) {
        table[slot] = vertexCount; xBits[vertexCount] = x; yBits[vertexCount] = y; zBits[vertexCount] = z;
        return vertexCount++;
      }
      if (xBits[id] === x && yBits[id] === y && zBits[id] === z) return id;
      slot = (slot + 1) & mask;
    }
  };

  const corners = new Int32Array(triangles * 3);
  let volume = 0;
  for (let triangle = 0; triangle < triangles; triangle++) {
    const offset = 84 + triangle * 50 + 12;   // first corner, after the normal
    for (let corner = 0; corner < 3; corner++) corners[triangle * 3 + corner] = vertexId(offset + corner * 12);
    const ax = view.getFloat32(offset, true), ay = view.getFloat32(offset + 4, true), az = view.getFloat32(offset + 8, true);
    const bx = view.getFloat32(offset + 12, true), by = view.getFloat32(offset + 16, true), bz = view.getFloat32(offset + 20, true);
    const cx = view.getFloat32(offset + 24, true), cy = view.getFloat32(offset + 28, true), cz = view.getFloat32(offset + 32, true);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }

  const edges = new Map();   // directed edge (from * vertexCount + to) -> how many triangles use it
  let degenerate = 0;
  for (let triangle = 0; triangle < triangles; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const from = corners[triangle * 3 + corner], to = corners[triangle * 3 + ((corner + 1) % 3)];
      if (from === to) { degenerate++; continue; }
      const edge = from * vertexCount + to;
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  let openEdges = 0;
  for (const [edge, count] of edges) {
    const from = Math.floor(edge / vertexCount), to = edge % vertexCount;
    if (count !== 1 || edges.get(to * vertexCount + from) !== 1) openEdges++;
  }
  return { triangles, vertices: vertexCount, openEdges, degenerate, volume, sizeOk: stl.length === 84 + triangles * 50 };
}

/* Minimum gap between the inner face of a cap and the threaded neck, with the cap fully seated and
   turned to the thread's phase, and how far the neck's thread reaches into the cap's groove. */
export function capClearance(G, shape, cap) {
  const bottom = cap.which === 'bottom';
  let minGap = Infinity, engagement = 0;
  for (let step = 0; step <= cap.threadLength * 20; step++) {
    const fromNeckEnd = step / 20;   // distance from the free end of the neck, in mm
    const neckRow = G.bodyRow(shape, bottom ? fromNeckEnd : shape.height - fromNeckEnd);
    const capRow = G.capRow(shape, cap, fromNeckEnd + cap.floor);
    for (let angleStep = 0; angleStep < 180; angleStep++) {
      const th = (G.TAU * angleStep) / 180;
      const neck = G.bodyR(shape, neckRow, th);
      const inner = G.capR(shape, cap, capRow, capRow.threadPhase - (neckRow.threadPhase - th));
      minGap = Math.min(minGap, inner - neck);
      engagement = Math.max(engagement, neck - (cap.neckRadius - cap.threadDepth + shape.clearance));
    }
  }
  return { minGap, engagement };
}

/* Numbers that pin down a binary STL: triangle count, enclosed volume, surface area, the bounding
   box, and per axis the sum of every coordinate, of their squares and of each one weighted by its
   place in the file (so moving or swapping vertices changes it). Comparing them with a small
   relative tolerance survives last-bit rounding differences that a byte digest would not. */
export function stlFingerprint(stl) {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const triangles = view.getUint32(80, true);
  const sums = [0, 0, 0], squares = [0, 0, 0], weighted = [0, 0, 0];
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  let volume = 0, area = 0;
  for (let triangle = 0; triangle < triangles; triangle++) {
    const corners = [0, 1, 2].map((corner) => [0, 1, 2].map((axis) => view.getFloat32(84 + triangle * 50 + 12 + corner * 12 + axis * 4, true)));
    corners.forEach((corner, cornerIndex) => {
      const weight = ((triangle * 3 + cornerIndex) % 1009) + 1;
      for (let axis = 0; axis < 3; axis++) {
        sums[axis] += corner[axis];
        squares[axis] += corner[axis] * corner[axis];
        weighted[axis] += weight * corner[axis];
        low[axis] = Math.min(low[axis], corner[axis]);
        high[axis] = Math.max(high[axis], corner[axis]);
      }
    });
    const [a, b, c] = corners;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const u = [0, 1, 2].map((axis) => b[axis] - a[axis]), v = [0, 1, 2].map((axis) => c[axis] - a[axis]);
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return { triangles, volume, area, sums, squares, weighted, low, high };
}

/* Distance from `point` to the designed outer surface of the body, r(θ, z) with the drop applied,
   found by sampling that surface finely within 1.2 mm of the point. */
export function distanceToBody(G, shape, point) {
  const angle = Math.atan2(point[1], point[0]), radius = Math.hypot(point[0], point[1]);
  let best = Infinity;
  for (let up = -1.2; up <= 1.2001; up += 0.04) {
    for (let around = -1.2; around <= 1.2001; around += 0.04) {
      const th = angle + around / Math.max(radius, 5), height = point[2] + up;
      if (height < 0 || height > G.dropZ(shape, shape.height, th)) continue;
      const surfaceRadius = G.bodyR(shape, G.bodyRow(shape, G.undropZ(shape, height, th)), th);
      best = Math.min(best, Math.hypot(surfaceRadius * Math.cos(th) - point[0], surfaceRadius * Math.sin(th) - point[1], height - point[2]));
    }
  }
  return best;
}
