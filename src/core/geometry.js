/* Geometry core: the whole model is a surface r(θ, z) around the Z axis.
   Every layer has a single closed contour, which is what spiral vase mode requires.
   This module depends on neither the browser nor Vue, so it can be tested with plain Node. */
export const TAU = Math.PI * 2;
const PZ = 0.1;             // sampling step of the base profile, in mm
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rad = (d) => (d * Math.PI) / 180;
const sstep = (a, b, x) => {
  if (a === b) return x >= b ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* Smooth curve through the points without overshoot (Fritsch–Carlson): between a maximum and a
   minimum it never leaves their range, so the free profile has no ripples nobody drew. */
export function monotone(xs, ys) {
  const n = xs.length, d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
    m[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]);
  }
  return (x) => {
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k], t = clamp((x - xs[k]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
  };
}
/* Round segments: the wider end of each segment is the belly of an ellipsoid centred on the axis, and
   the segment runs down it to the narrower point. With the right heights it is an exact sphere, and
   two neighbouring lobes meet in a sharp waist, as in a gourd. */
export function lobes(xs, ys) {
  return (x) => {
    let k = 0;
    while (k < xs.length - 2 && x > xs[k + 1]) k++;
    const a = ys[k], b = ys[k + 1];
    if (a === b) return a;
    const hiFirst = a > b;
    const rh = hiFirst ? a : b, c = (hiFirst ? b : a) / rh;
    const t = clamp((hiFirst ? x - xs[k] : xs[k + 1] - x) / (xs[k + 1] - xs[k]), 0, 1);
    return rh * Math.sqrt(1 - (1 - c * c) * t * t);
  };
}
export function cleanPoints(pts) {
  if (!Array.isArray(pts)) return [];
  const out = [];
  for (const p of pts) {
    if (!Array.isArray(p) || !Number.isFinite(+p[0]) || !Number.isFinite(+p[1])) continue;
    out.push([clamp(+p[0], 0.03, 0.97), clamp(+p[1], 0.05, 1)]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const res = [];
  for (const p of out) if (!res.length || p[0] - res[res.length - 1][0] >= 0.02) res.push(p);
  return res.slice(0, 12);
}

/* ---------- derived parameters and base profile ---------- */
export function derive(p) {
  const q = {};
  q.H = clamp(+p.H || 0, 30, 400);
  q.Rmax = clamp(+p.D || 0, 20, 400) / 2;
  let Lb = Math.max(0, +p.botL || 0);
  let Lt = Math.max(0, +p.topL || 0);
  const maxNeck = Math.max(0, q.H - 20);
  if (Lb + Lt > maxNeck) { const s = maxNeck / (Lb + Lt); Lb *= s; Lt *= s; }
  q.Lb = Lb; q.Lt = Lt;
  q.Rb = clamp((+p.botD || 0) / 2, 3, q.Rmax);
  q.Rt = clamp((+p.topD || 0) / 2, 3, q.Rmax);
  q.zb = Lb; q.zt = q.H - Lt; q.hb = q.zt - q.zb;
  q.zc = q.zb + (q.hb * clamp(+p.belly || 50, 5, 95)) / 100;
  q.n = clamp(+p.n || 2, 1.2, 12);
  q.limit = clamp(+p.shoulder || 45, 5, 82);     // maximum wall tilt, in degrees from vertical
  q.tanS = Math.tan(rad(q.limit));
  q.closed = p.base === 'closed';
  q.baseT = clamp(+p.baseT || 1, 0.3, 6);
  q.pts = p.profile === 'free' ? cleanPoints(p.pts) : [];
  q.free = q.pts.length > 0;
  q.tanMax = Math.tan(rad(Math.min(q.limit + 5, 85)));   // headroom the rings may use on top of that tilt
  q.protect = p.protect !== false;

  q.pitch = clamp(+p.pitch || 4, 1.5, 12);
  q.c = clamp(+p.clearance || 0, 0, 1.5);
  q.lw = clamp(+p.lw || 0.6, 0.2, 1.6);
  q.lh = clamp(+p.lh || 0.2, 0.05, 0.8);
  q.capWall = clamp(+p.capWall || 2, 0.8, 8);
  q.capFloor = clamp(+p.capFloor || 1.6, 0.6, 8);
  q.holeB = p.botHole ? Math.max(0, +p.botHoleD || 0) / 2 : 0;
  q.holeT = p.topHole ? Math.max(0, +p.topHoleD || 0) / 2 : 0;
  const dep = clamp(+p.depth || 1, 0.3, 4);
  q.depB = Math.min(dep, q.Rb - 4);
  q.depT = Math.min(dep, q.Rt - 4);
  q.thB = !!p.botThread && !q.closed && Lb >= q.pitch && q.depB > 0.2;
  q.thT = !!p.topThread && Lt >= q.pitch && q.depT > 0.2;
  q.rlB = Math.min(0.75 * q.pitch, Lb / 3);
  q.rlT = Math.min(0.75 * q.pitch, Lt / 3);

  q.rings = Math.max(0, Math.round(+p.rings || 0));
  q.ringA = +p.ringRelief || 0;
  q.ringW = q.rings > 0 ? Math.min(Math.max(0.5, +p.ringWidth || 1), q.hb / q.rings) : 0;
  q.ribs = clamp(Math.round(+p.ribs || 0), 0, 160);
  q.ribCrest = p.ribShape === 'crest';
  q.ribProp = !!p.ribProp;
  q.ribA = q.ribs > 0 ? +p.ribRelief || 0 : 0;
  q.ribWf = clamp((+p.ribWidth || 30) / 100, 0.05, 1);
  q.twist = q.ribs > 0 && q.ribA !== 0 ? rad(+p.twist || 0) : 0;
  q.ramp = clamp(q.hb * 0.18, 4, 25);
  q.blendT = clamp(+p.neckBlend || 0, 0, 0.6 * q.hb);   // length of the transition into the mouth

  /* Base profile: a superelliptic barrel or a free curve through points, limited to the maximum
     wall tilt starting from the radius of each mouth. With `ptsL`, the left side (θ = π) gets its
     own free profile and the right side (θ = 0) keeps `pts`; bodyR blends the two around. */
  const M = Math.max(8, Math.ceil(q.H / PZ));
  const dz = q.H / M;
  const curveOf = (pts) => (p.curve === 'round' ? lobes : monotone)(
    [q.zb, ...pts.map((pt) => q.zb + pt[0] * q.hb), q.zt], [q.Rb, ...pts.map((pt) => pt[1] * q.Rmax), q.Rt]);
  const right = profileSide(q, M, dz, q.free ? curveOf(q.pts) : null);
  q.ptsL = q.free ? cleanPoints(p.ptsL) : [];
  q.asym = q.ptsL.length > 0;
  const left = q.asym ? profileSide(q, M, dz, curveOf(q.ptsL)) : right;
  q.want = right.want; q.wantL = left.want;   // requested profiles, before the tilt limit is applied
  q.wantDeg = Math.max(right.wantDeg, left.wantDeg);
  const base = right.base, slope = right.slope;
  /* Relief of each ring: constant within the ring and trimmed so that, added to the tilt the wall
     already has (and to the headroom the ribs use), it stays under the limit. */
  q.ringAmp = new Float64Array(q.rings);
  if (q.rings > 0) {
    const sp = q.hb / q.rings, w = q.ringW;
    const hasRibs = q.ribA !== 0;
    const twistUse = hasRibs ? (Math.abs(q.ribA) * 0.5 * q.ribs * Math.abs(q.twist)) / (q.ribWf * q.hb) : 0;
    const rampUse = hasRibs ? (Math.abs(q.ribA) * 1.5) / q.ramp : 0;
    for (let k = 0; k < q.rings; k++) {
      let A = Math.abs(q.ringA);
      if (q.protect) {
        const zr = q.zb + (k + 0.5) * sp;
        const i0 = Math.max(0, Math.floor((zr - w / 2) / dz)), i1 = Math.min(M, Math.ceil((zr + w / 2) / dz));
        let used = 0;
        for (let i = i0; i <= i1; i++) {
          const z = i * dz;
          let u = Math.max(Math.abs(slope[i]), Math.abs(left.slope[i])) + twistUse;
          if ((q.thB && z < q.zb + q.ramp) || (q.thT && z > q.zt - q.ramp)) u += rampUse;
          if (u > used) used = u;
        }
        A = Math.min(A, (Math.max(0, q.tanMax - used) * w) / Math.PI);
      }
      q.ringAmp[k] = Math.sign(q.ringA) * A;
    }
  }
  q.M = M; q.dz = dz; q.base = base; q.slope = slope;
  q.baseL = left.base; q.slopeL = left.slope;
  return q;
}

/* One side of the base profile: the free curve (or the barrel when `curve` is null) sampled every
   dz, then limited to the maximum tilt from each mouth and smoothed. */
function profileSide(q, M, dz, curve) {
  const base = new Float64Array(M + 1);
  for (let i = 0; i <= M; i++) {
    const z = i * dz;
    if (z <= q.zb) { base[i] = q.Rb; continue; }
    if (z >= q.zt) { base[i] = q.Rt; continue; }
    if (curve) { base[i] = clamp(curve(z), 3, q.Rmax); continue; }
    const lower = z < q.zc;
    const u = lower ? (q.zc - z) / Math.max(1e-6, q.zc - q.zb) : (z - q.zc) / Math.max(1e-6, q.zt - q.zc);
    const barrel = q.Rmax * Math.pow(Math.max(0, 1 - Math.pow(u, q.n)), 1 / q.n);
    base[i] = Math.max(barrel, lower ? q.Rb : q.Rt);
  }
  const want = Float64Array.from(base);
  let wmax = 0;
  for (let i = 1; i <= M; i++) wmax = Math.max(wmax, Math.abs(base[i] - base[i - 1]) / dz);
  const ib = Math.min(M, Math.round(q.zb / dz));
  const it = Math.max(0, Math.round(q.zt / dz));
  const step = dz * q.tanS;
  const limit = () => {
    for (let i = ib + 1; i <= it; i++) base[i] = Math.min(base[i], base[i - 1] + step);
    for (let i = it - 1; i >= ib; i--) base[i] = Math.min(base[i], base[i + 1] + step);
  };
  limit();
  /* Transition into the mouth: the last `blendT` mm of the body become a flare that reaches the
     mouth radius upright (a parabola from the body's radius there), so the wall bends into the
     neck or the rim gradually instead of in a short turn. The corner where the flare meets the
     body is rounded off over a quarter of its length, and the tilt limit runs again on top. */
  const i1 = Math.round((q.zt - q.blendT) / dz);
  if (q.blendT > 0 && i1 > ib + 1 && i1 < it) {
    const h = (it - i1) * dz, r1 = base[i1];
    for (let i = i1 + 1; i < it; i++) base[i] = q.Rt + (r1 - q.Rt) * (1 - ((i - i1) * dz) / h) ** 2;
    const k = Math.max(1, Math.round(Math.min(h / 4, 15) / dz));
    for (let pass = 0; pass < 3; pass++) {
      const pre = new Float64Array(M + 2);
      for (let i = 0; i <= M; i++) pre[i + 1] = pre[i] + base[i];
      for (let i = Math.max(ib + 1, i1 - 2 * k); i < Math.min(it, i1 + 2 * k); i++) {
        const w = Math.min(k, i - ib, it - i);
        if (w > 0) base[i] = (pre[i + w + 1] - pre[i - w]) / (2 * w + 1);
      }
    }
    limit();
  }
  /* Smoothing with a window that shrinks towards the necks, so they stay put. */
  const K = Math.round(3 / dz);
  for (let pass = 0; pass < 2; pass++) {
    const pre = new Float64Array(M + 2);
    for (let i = 0; i <= M; i++) pre[i + 1] = pre[i] + base[i];
    for (let i = ib + 1; i < it; i++) {
      const k = Math.min(K, i - ib, it - i);
      if (k > 0) base[i] = (pre[i + k + 1] - pre[i - k]) / (2 * k + 1);
    }
  }
  const slope = new Float64Array(M + 1);
  for (let i = 0; i <= M; i++) {
    const a = Math.max(0, i - 1), b = Math.min(M, i + 1);
    slope[i] = (base[b] - base[a]) / ((b - a) * dz);
  }
  return { base, want, slope, wantDeg: (Math.atan(wmax) * 180) / Math.PI };
}

/* ---------- body ---------- */
export function bodyRow(q, z) {
  const row = { z, base: 0, add: 0, ribAmp: 0, tw: 0, th: 0, e: 1, x: 1, ph: 0, dep: 0 };
  const t = z / q.dz;
  const i = Math.min(q.M - 1, Math.max(0, Math.floor(t)));
  const f = clamp(t - i, 0, 1);
  row.base = q.base[i] * (1 - f) + q.base[i + 1] * f;
  row.baseL = q.asym ? q.baseL[i] * (1 - f) + q.baseL[i + 1] * f : row.base;
  if (z >= q.zb && z <= q.zt) {
    if (q.rings > 0 && q.ringA !== 0) {
      const sp = q.hb / q.rings;
      const u = (z - q.zb) / sp;
      const d = (u - Math.floor(u) - 0.5) * sp;
      const w = q.ringW;
      if (Math.abs(d) < w / 2) row.add = q.ringAmp[Math.min(q.rings - 1, Math.floor(u))] * 0.5 * (1 + Math.cos((TAU * d) / w));
    }
    row.tw = (q.twist * (z - q.zb)) / q.hb;
  } else {
    row.tw = z <= q.zb ? 0 : q.twist;
  }
  /* Ribs also run along plain necks; they only fade out towards a threaded neck, which has to
     stay round. */
  if (q.ribA !== 0) {
    const fb = q.thB ? sstep(q.zb, q.zb + q.ramp, z) : 1;
    const ft = q.thT ? sstep(q.zt, q.zt - q.ramp, z) : 1;
    row.ribAmp = q.ribA * fb * ft * (q.ribProp ? row.base / q.Rmax : 1);
  }
  if (q.thB && z <= q.Lb) {
    row.th = 1; row.dep = q.depB;
    row.e = sstep(0, q.rlB, z);
    row.x = 1 - sstep(q.Lb - q.rlB, q.Lb, z);
    row.ph = (TAU * z) / q.pitch;
  } else if (q.thT && z >= q.zt) {
    const d = q.H - z;
    row.th = 2; row.dep = q.depT;
    row.e = sstep(0, q.rlT, d);
    row.x = 1 - sstep(q.Lt - q.rlT, q.Lt, d);
    row.ph = (TAU * z) / q.pitch;
  }
  return row;
}

/* Radius of the base profile at angle th: the right profile at θ = 0, the left one at θ = π, and a
   cosine blend in between, so the cross-section stays smooth and the wall never tilts more than
   the steeper of the two sides. */
function baseAt(row, th) {
  if (row.baseL === row.base) return row.base;
  const w = 0.5 + 0.5 * Math.cos(th);
  return row.baseL + (row.base - row.baseL) * w;
}
export function bodyR(q, row, th) {
  const b = baseAt(row, th);
  let r = b + row.add;
  if (row.ribAmp !== 0) {
    const u = ((th - row.tw) * q.ribs) / TAU;
    const d = u - Math.round(u);
    const ad = Math.abs(d);
    const amp = q.ribProp && row.base > 0 ? (row.ribAmp * b) / row.base : row.ribAmp;
    if (ad < q.ribWf / 2) r += amp * (q.ribCrest ? 1 - Math.sin((Math.PI * ad) / q.ribWf) : 0.5 * (1 + Math.cos((TAU * d) / q.ribWf)));
  }
  if (row.th) {
    const g = 0.5 + 0.5 * Math.cos(row.ph - th);
    r -= row.dep * (1 - row.e + row.e * row.x * (1 - g));
  }
  return r < 1.5 ? 1.5 : r;   // relief never collapses the contour
}

/* ---------- caps: a regular solid part, smooth outside, with the female thread only on the inside.
   Printed with the closed face on the bed and the opening facing up. ---------- */
export function capSpec(q, which) {
  const bottom = which === 'bottom';
  if (bottom ? !q.thB : !q.thT) return null;
  const L = bottom ? q.Lb : q.Lt;
  const R = bottom ? q.Rb : q.Rt;
  const dep = bottom ? q.depB : q.depT;
  const rl = bottom ? q.rlB : q.rlT;
  const floor = q.capFloor, wall = q.capWall;
  /* Through hole in the cap floor: at most large enough to leave a lip that sits on the neck rim. */
  const holeMax = Math.max(0, R - dep - 0.5);
  const want = bottom ? q.holeB : q.holeT;
  const hole = want > 0 && holeMax >= 1 ? clamp(want, 1, holeMax) : 0;
  return { which, L, R, dep, rl, floor, wall, hole, holeMax, H: L + floor, Rout: R + q.c + wall, chamfer: Math.min(0.6, floor / 2, wall / 2), turns: Math.max(0, L - 2 * rl) / q.pitch };
}
export function capRow(q, cap, z) {
  return { z, tw: 0, f: sstep(cap.floor, cap.floor + cap.rl, z) * sstep(0, cap.rl, cap.H - z), ph: (TAU * z) / q.pitch };
}
/* radius of the inner face of the cap */
export function capR(q, cap, row, th) {
  const g = 0.5 + 0.5 * Math.cos(row.ph - th);
  return cap.R - cap.dep + q.c + cap.dep * (1 - row.f * (1 - g));
}
/* Contour rings: floor, chamfer, smooth outer wall, rim, then down the inner face to the floor.
   With creases=true the rings on sharp edges are duplicated so the preview renders them crisp. */
export function buildCap(q, cap, nT, dzTarget, creases) {
  const rings = [];
  const flat = (r) => () => r;
  const add = (z, rf, crease) => { rings.push({ z, rf }); if (crease && creases) rings.push({ z, rf }); };
  add(0, flat(cap.Rout - cap.chamfer), true);
  add(cap.chamfer, flat(cap.Rout), true);
  add(cap.H, flat(cap.Rout), true);
  const nIn = Math.max(2, Math.ceil(cap.L / dzTarget));
  for (let k = 0; k <= nIn; k++) {
    const z = cap.H - (cap.L * k) / nIn;
    const row = capRow(q, cap, z);
    add(z, (th) => capR(q, cap, row, th), k === 0 || k === nIn);
  }
  /* With a hole the contour does not end on the axis: it goes down the hole wall and back to the first ring. */
  if (cap.hole > 0) { add(cap.floor, flat(cap.hole), true); add(0, flat(cap.hole), true); }
  const nZ = rings.length;
  const pos = new Float32Array(nT * nZ * 3);
  let o = 0;
  for (let j = 0; j < nZ; j++) {
    for (let i = 0; i < nT; i++) {
      const th = (TAU * i) / nT;
      const r = rings[j].rf(th);
      pos[o++] = r * Math.cos(th); pos[o++] = r * Math.sin(th); pos[o++] = rings[j].z;
    }
  }
  return { pos, nT, nZ, H: cap.H, loop: cap.hole > 0, c0: [0, 0, 0], c1: [0, 0, cap.floor] };
}

/* ---------- (θ, z) grid meshing ---------- */
function grid(H, nT, nZ, rowFn, rFn) {
  const pos = new Float32Array(nT * nZ * 3);
  const rr = new Float32Array(nT * nZ);
  const zs = new Float32Array(nZ);
  const tws = new Float32Array(nZ);
  const zone = new Uint8Array(nZ);
  let o = 0, k = 0;
  for (let j = 0; j < nZ; j++) {
    const z = (H * j) / (nZ - 1);
    const row = rowFn(z);
    zs[j] = z; tws[j] = row.tw; zone[j] = row.th || 0;
    for (let i = 0; i < nT; i++) {
      const th = (TAU * i) / nT + row.tw;
      const r = rFn(row, th);
      rr[k++] = r;
      pos[o++] = r * Math.cos(th);
      pos[o++] = r * Math.sin(th);
      pos[o++] = z;
    }
  }
  return { pos, rr, zs, tws, zone, nT, nZ, H, c0: [0, 0, 0], c1: [0, 0, H] };
}
/* Segments around: a multiple of the rib count, so every crest lands on a vertex. */
export function segments(q, target, perRib) {
  if (q.ribs > 0 && q.ribA !== 0) return Math.max(q.ribs * (perRib || 8), Math.round(target / q.ribs) * q.ribs);
  return target;
}
export function buildBody(q, nTarget, dzTarget, perRib) {
  const nT = segments(q, nTarget, perRib);
  const nZ = Math.max(3, Math.ceil(q.H / dzTarget) + 1);
  return grid(q.H, nT, nZ, (z) => bodyRow(q, z), (row, th) => bodyR(q, row, th));
}

/* ---------- measurements: area, maximum radius and wall tilt ---------- */
export function measure(g, wantAngles) {
  const { pos, rr, zs, tws, zone, nT, nZ } = g;
  const dth = TAU / nT;
  let rMax = 0, area = 0;
  const zoneMax = [0, 0, 0];
  const ang = wantAngles ? new Float32Array(nT * nZ) : null;
  for (let j = 0; j < nZ; j++) {
    const ja = Math.max(0, j - 1), jb = Math.min(nZ - 1, j + 1);
    const dzz = zs[jb] - zs[ja];
    const twp = (tws[jb] - tws[ja]) / dzz;
    for (let i = 0; i < nT; i++) {
      const k = j * nT + i;
      const r = rr[k];
      if (r > rMax) rMax = r;
      const rth = (rr[j * nT + ((i + 1) % nT)] - rr[j * nT + ((i + nT - 1) % nT)]) / (2 * dth);
      const rz = (rr[jb * nT + i] - rr[ja * nT + i]) / dzz - rth * twp;
      const a = Math.atan((r * Math.abs(rz)) / Math.sqrt(r * r + rth * rth));
      if (ang) ang[k] = a;
      if (a > zoneMax[zone[j]]) zoneMax[zone[j]] = a;
      if (j < nZ - 1) {
        const i2 = (i + 1) % nT;
        const a0 = k * 3, b0 = (j * nT + i2) * 3, c0 = ((j + 1) * nT + i2) * 3, d0 = ((j + 1) * nT + i) * 3;
        area += triArea(pos, a0, b0, c0) + triArea(pos, a0, c0, d0);
      }
    }
  }
  const deg = zoneMax.map((v) => (v * 180) / Math.PI);
  return { rMax, area, overBody: deg[0], overBot: deg[1], overTop: deg[2], over: Math.max(deg[0], deg[1], deg[2]), ang };
}
function triArea(p, a, b, c) {
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  return 0.5 * Math.sqrt(x * x + y * y + z * z);
}

/* ---------- triangles of a ring mesh ---------- */
export const triCount = (nT, nZ) => 2 * nT * (nZ - 1) + 2 * nT;
export const triCountOf = (g) => (g.loop ? 2 * g.nT * g.nZ : triCount(g.nT, g.nZ));

/* Visits the triangles with outward normals. A regular mesh is a stack of rings closed by its two
   centres; a loop mesh (a cap with a hole) joins the last ring back to the first. */
export function eachTri(g, put) {
  const { pos, nT, nZ, c0, c1, loop } = g;
  const P = (k) => k * 3;
  if (!loop) for (let i = 0; i < nT; i++) {
    const a = P(i), b = P((i + 1) % nT);
    put(c0[0], c0[1], c0[2], pos[b], pos[b + 1], pos[b + 2], pos[a], pos[a + 1], pos[a + 2]);
  }
  for (let j = 0; j < (loop ? nZ : nZ - 1); j++) {
    const j2 = (j + 1) % nZ;
    for (let i = 0; i < nT; i++) {
      const i2 = (i + 1) % nT;
      const a = P(j * nT + i), b = P(j * nT + i2), c = P(j2 * nT + i2), d = P(j2 * nT + i);
      put(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]);
      put(pos[a], pos[a + 1], pos[a + 2], pos[c], pos[c + 1], pos[c + 2], pos[d], pos[d + 1], pos[d + 2]);
    }
  }
  const top = (nZ - 1) * nT;
  if (!loop) for (let i = 0; i < nT; i++) {
    const a = P(top + i), b = P(top + ((i + 1) % nT));
    put(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], c1[0], c1[1], c1[2]);
  }
}

export function volume(g) {
  let v = 0;
  eachTri(g, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  });
  return v;
}
