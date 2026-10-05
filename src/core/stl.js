import { eachTri, triCountOf } from './geometry.js';

/* Binary STL: a closed solid, in millimetres, with the Z axis pointing up. */
export function toSTL(g, label) {
  const n = triCountOf(g);
  const out = new Uint8Array(84 + n * 50);
  const head = 'Torno Espiral - ' + (label || 'part') + ' - mm';
  for (let i = 0; i < Math.min(79, head.length); i++) out[i] = head.charCodeAt(i) & 0x7f;
  new DataView(out.buffer).setUint32(80, n, true);
  const f = new Float32Array(12);
  const fb = new Uint8Array(f.buffer);
  let off = 84;
  eachTri(g, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    f[0] = nx / l; f[1] = ny / l; f[2] = nz / l;
    f[3] = ax; f[4] = ay; f[5] = az; f[6] = bx; f[7] = by; f[8] = bz; f[9] = cx; f[10] = cy; f[11] = cz;
    out.set(fb, off); off += 50;
  });
  return out;
}
