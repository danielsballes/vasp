import { eachTri, triCountOf } from './geometry.js';

/* Binary STL: a closed solid, in millimetres, with the Z axis pointing up. */
/* Each triangle takes 50 bytes: its normal and three corners as 12 floats, then 2 unused bytes. */
export function toSTL(mesh, label) {
  const triangles = triCountOf(mesh);
  const out = new Uint8Array(84 + triangles * 50);
  const header = 'Vasp - ' + (label || 'part') + ' - mm';
  for (let i = 0; i < Math.min(79, header.length); i++) out[i] = header.charCodeAt(i) & 0x7f;
  new DataView(out.buffer).setUint32(80, triangles, true);
  const record = new Float32Array(12);
  const recordBytes = new Uint8Array(record.buffer);
  let offset = 84;
  eachTri(mesh, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    /* normal: cross product of two edges (u = b - a, v = c - a), normalised */
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    record[0] = nx / length; record[1] = ny / length; record[2] = nz / length;
    record[3] = ax; record[4] = ay; record[5] = az; record[6] = bx; record[7] = by; record[8] = bz; record[9] = cx; record[10] = cy; record[11] = cz;
    out.set(recordBytes, offset); offset += 50;
  });
  return out;
}
