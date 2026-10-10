/* Geometry core: the whole model is a surface r(θ, z) around the Z axis.
   Every layer has a single closed contour, which is what spiral vase mode requires.
   This module depends on neither the browser nor Vue, so it can be tested with plain Node.

   Naming: `params` are the values the user edits (the keys of the parameters file) and `shape`
   is what derive() works out from them, in millimetres. Heights (z) are measured from the floor
   and angles (th, θ) around the Z axis, with θ = 0 at the front of the part. */
export const TAU = Math.PI * 2;
const PROFILE_STEP = 0.1;   // sampling step of the base profile, in mm
export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
const toRadians = (degrees) => (degrees * Math.PI) / 180;
/* 0 below `from`, 1 past `to` and an S-shaped ramp in between (it also works with to < from). */
const smoothstep = (from, to, value) => {
  if (from === to) return value >= to ? 1 : 0;
  const progress = clamp((value - from) / (to - from), 0, 1);
  return progress * progress * (3 - 2 * progress);
};

/* Smooth curve through the points without overshoot (Fritsch–Carlson): between a maximum and a
   minimum it never leaves their range, so the free profile has no ripples nobody drew. */
export function monotone(xs, ys) {
  const count = xs.length;
  const secants = new Array(count - 1), tangents = new Array(count);
  for (let i = 0; i < count - 1; i++) secants[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  tangents[0] = secants[0]; tangents[count - 1] = secants[count - 2];
  for (let i = 1; i < count - 1; i++) {
    if (secants[i - 1] * secants[i] <= 0) { tangents[i] = 0; continue; }
    const widthBefore = xs[i] - xs[i - 1], widthAfter = xs[i + 1] - xs[i];
    tangents[i] = (3 * (widthBefore + widthAfter)) / ((2 * widthAfter + widthBefore) / secants[i - 1] + (widthAfter + 2 * widthBefore) / secants[i]);
  }
  return (x) => {
    let segment = 0;
    while (segment < count - 2 && x > xs[segment + 1]) segment++;
    const width = xs[segment + 1] - xs[segment];
    const t = clamp((x - xs[segment]) / width, 0, 1), t2 = t * t, t3 = t2 * t;   // cubic Hermite basis
    return (2 * t3 - 3 * t2 + 1) * ys[segment] + (t3 - 2 * t2 + t) * width * tangents[segment]
      + (-2 * t3 + 3 * t2) * ys[segment + 1] + (t3 - t2) * width * tangents[segment + 1];
  };
}
/* Round segments: the wider end of each segment is the belly of an ellipsoid centred on the axis, and
   the segment runs down it to the narrower point. With the right heights it is an exact sphere, and
   two neighbouring lobes meet in a sharp waist, as in a gourd. */
export function lobes(xs, ys) {
  return (x) => {
    let segment = 0;
    while (segment < xs.length - 2 && x > xs[segment + 1]) segment++;
    const startRadius = ys[segment], endRadius = ys[segment + 1];
    if (startRadius === endRadius) return startRadius;
    const widerFirst = startRadius > endRadius;
    const bellyRadius = widerFirst ? startRadius : endRadius;
    const waistShare = (widerFirst ? endRadius : startRadius) / bellyRadius;
    const fromBelly = clamp((widerFirst ? x - xs[segment] : xs[segment + 1] - x) / (xs[segment + 1] - xs[segment]), 0, 1);
    return bellyRadius * Math.sqrt(1 - (1 - waistShare * waistShare) * fromBelly * fromBelly);
  };
}
/* Valid free-profile points: [height share, radius share] pairs, sorted, at least 2 % apart, 12 at most. */
export function cleanPoints(points) {
  if (!Array.isArray(points)) return [];
  const valid = [];
  for (const point of points) {
    if (!Array.isArray(point) || !Number.isFinite(+point[0]) || !Number.isFinite(+point[1])) continue;
    valid.push([clamp(+point[0], 0.03, 0.97), clamp(+point[1], 0.05, 1)]);
  }
  valid.sort((a, b) => a[0] - b[0]);
  const spaced = [];
  for (const point of valid) if (!spaced.length || point[0] - spaced[spaced.length - 1][0] >= 0.02) spaced.push(point);
  return spaced.slice(0, 12);
}

/* ---------- derived parameters and base profile ---------- */
export function derive(params) {
  const shape = {};
  shape.height = clamp(+params.H || 0, 30, 400);
  shape.maxRadius = clamp(+params.D || 0, 20, 400) / 2;
  let bottomNeck = Math.max(0, +params.botL || 0);
  let topNeck = Math.max(0, +params.topL || 0);
  const maxNecks = Math.max(0, shape.height - 20);
  if (bottomNeck + topNeck > maxNecks) {
    const shrink = maxNecks / (bottomNeck + topNeck);
    bottomNeck *= shrink; topNeck *= shrink;
  }
  shape.bottomNeck = bottomNeck; shape.topNeck = topNeck;   // neck lengths
  shape.bottomRadius = clamp((+params.botD || 0) / 2, 3, shape.maxRadius);
  shape.topRadius = clamp((+params.topD || 0) / 2, 3, shape.maxRadius);
  /* The body runs between the two necks. */
  shape.bodyBottom = bottomNeck; shape.bodyTop = shape.height - topNeck; shape.bodyHeight = shape.bodyTop - shape.bodyBottom;
  shape.bellyHeight = shape.bodyBottom + (shape.bodyHeight * clamp(+params.belly || 50, 5, 95)) / 100;
  shape.squareness = clamp(+params.n || 2, 1.2, 12);
  shape.maxTilt = clamp(+params.shoulder || 45, 5, 82);   // maximum wall tilt, in degrees from vertical
  shape.maxTiltTan = Math.tan(toRadians(shape.maxTilt));
  shape.closedBase = params.base === 'closed';
  shape.baseThickness = clamp(+params.baseT || 1, 0.3, 6);
  shape.points = params.profile === 'free' ? cleanPoints(params.pts) : [];
  shape.freeProfile = shape.points.length > 0;
  shape.ringTiltTan = Math.tan(toRadians(Math.min(shape.maxTilt + 5, 85)));   // headroom the rings may use on top of that tilt
  shape.protectRings = params.protect !== false;

  shape.pitch = clamp(+params.pitch || 4, 1.5, 12);
  shape.clearance = clamp(+params.clearance || 0, 0, 1.5);
  shape.lineWidth = clamp(+params.lw || 0.6, 0.2, 1.6);
  shape.layerHeight = clamp(+params.lh || 0.2, 0.05, 0.8);
  shape.capWall = clamp(+params.capWall || 2, 0.8, 8);
  shape.capFloor = clamp(+params.capFloor || 1.6, 0.6, 8);
  shape.bottomHoleRadius = params.botHole ? Math.max(0, +params.botHoleD || 0) / 2 : 0;
  shape.topHoleRadius = params.topHole ? Math.max(0, +params.topHoleD || 0) / 2 : 0;
  const threadDepth = clamp(+params.depth || 1, 0.3, 4);
  shape.bottomThreadDepth = Math.min(threadDepth, shape.bottomRadius - 4);
  shape.topThreadDepth = Math.min(threadDepth, shape.topRadius - 4);
  shape.bottomThread = !!params.botThread && !shape.closedBase && bottomNeck >= shape.pitch && shape.bottomThreadDepth > 0.2;
  shape.topThread = !!params.topThread && topNeck >= shape.pitch && shape.topThreadDepth > 0.2;
  /* Length over which the thread groove fades in at the free end of a neck and out next to the body. */
  shape.bottomThreadRunout = Math.min(0.75 * shape.pitch, bottomNeck / 3);
  shape.topThreadRunout = Math.min(0.75 * shape.pitch, topNeck / 3);

  shape.rings = Math.max(0, Math.round(+params.rings || 0));
  shape.ringRelief = +params.ringRelief || 0;
  shape.ringWidth = shape.rings > 0 ? Math.min(Math.max(0.5, +params.ringWidth || 1), shape.bodyHeight / shape.rings) : 0;
  shape.ribs = clamp(Math.round(+params.ribs || 0), 0, 160);
  shape.ribCrest = params.ribShape === 'crest';
  shape.ribsProportional = !!params.ribProp;
  shape.ribRelief = shape.ribs > 0 ? +params.ribRelief || 0 : 0;
  shape.ribWidthShare = clamp((+params.ribWidth || 30) / 100, 0.05, 1);   // share of the space between two ribs
  shape.twist = shape.ribs > 0 && shape.ribRelief !== 0 ? toRadians(+params.twist || 0) : 0;
  shape.ribFade = clamp(shape.bodyHeight * 0.18, 4, 25);   // length over which ribs fade out towards a threaded neck

  /* Base profile: a superelliptic barrel or a free curve through points, limited to the maximum
     wall tilt starting from the radius of each mouth. With `ptsL`, the left side (θ = π) gets its
     own free profile and the right side (θ = 0) keeps `pts`; bodyR blends the two around. */
  const sampleCount = Math.max(8, Math.ceil(shape.height / PROFILE_STEP));
  const sampleStep = shape.height / sampleCount;
  const curveThrough = (points) => (params.curve === 'round' ? lobes : monotone)(
    [shape.bodyBottom, ...points.map((point) => shape.bodyBottom + point[0] * shape.bodyHeight), shape.bodyTop],
    [shape.bottomRadius, ...points.map((point) => point[1] * shape.maxRadius), shape.topRadius],
  );
  const right = profileSide(shape, sampleCount, sampleStep, shape.freeProfile ? curveThrough(shape.points) : null);
  shape.pointsLeft = shape.freeProfile ? cleanPoints(params.ptsL) : [];
  shape.twoSides = shape.pointsLeft.length > 0;
  const left = shape.twoSides ? profileSide(shape, sampleCount, sampleStep, curveThrough(shape.pointsLeft)) : right;
  /* requested profiles, before the tilt limit is applied */
  shape.wantedRadii = right.wantedRadii; shape.wantedRadiiLeft = left.wantedRadii;
  shape.wantedTilt = Math.max(right.wantedTilt, left.wantedTilt);
  const radii = right.radii, slopes = right.slopes;
  /* Relief of each ring: constant within the ring and trimmed so that, added to the tilt the wall
     already has (and to the headroom the ribs use), it stays under the limit. */
  shape.ringReliefs = new Float64Array(shape.rings);
  if (shape.rings > 0) {
    const ringSpacing = shape.bodyHeight / shape.rings, ringWidth = shape.ringWidth;
    const hasRibs = shape.ribRelief !== 0;
    const twistSlope = hasRibs ? (Math.abs(shape.ribRelief) * 0.5 * shape.ribs * Math.abs(shape.twist)) / (shape.ribWidthShare * shape.bodyHeight) : 0;
    const fadeSlope = hasRibs ? (Math.abs(shape.ribRelief) * 1.5) / shape.ribFade : 0;
    for (let ring = 0; ring < shape.rings; ring++) {
      let relief = Math.abs(shape.ringRelief);
      if (shape.protectRings) {
        const ringCenter = shape.bodyBottom + (ring + 0.5) * ringSpacing;
        const firstSample = Math.max(0, Math.floor((ringCenter - ringWidth / 2) / sampleStep));
        const lastSample = Math.min(sampleCount, Math.ceil((ringCenter + ringWidth / 2) / sampleStep));
        let slopeUsed = 0;
        for (let sample = firstSample; sample <= lastSample; sample++) {
          const z = sample * sampleStep;
          let slope = Math.max(Math.abs(slopes[sample]), Math.abs(left.slopes[sample])) + twistSlope;
          if ((shape.bottomThread && z < shape.bodyBottom + shape.ribFade) || (shape.topThread && z > shape.bodyTop - shape.ribFade)) slope += fadeSlope;
          if (slope > slopeUsed) slopeUsed = slope;
        }
        relief = Math.min(relief, (Math.max(0, shape.ringTiltTan - slopeUsed) * ringWidth) / Math.PI);
      }
      shape.ringReliefs[ring] = Math.sign(shape.ringRelief) * relief;
    }
  }
  shape.sampleCount = sampleCount; shape.sampleStep = sampleStep; shape.radii = radii; shape.slopes = slopes;
  shape.radiiLeft = left.radii; shape.slopesLeft = left.slopes;
  return shape;
}

/* One side of the base profile: the free curve (or the barrel when `curve` is null) sampled every
   sampleStep, then limited to the maximum tilt from each mouth and smoothed. */
function profileSide(shape, sampleCount, sampleStep, curve) {
  const radii = new Float64Array(sampleCount + 1);
  for (let sample = 0; sample <= sampleCount; sample++) {
    const z = sample * sampleStep;
    if (z <= shape.bodyBottom) { radii[sample] = shape.bottomRadius; continue; }
    if (z >= shape.bodyTop) { radii[sample] = shape.topRadius; continue; }
    if (curve) { radii[sample] = clamp(curve(z), 3, shape.maxRadius); continue; }
    const lower = z < shape.bellyHeight;
    const fromBelly = lower
      ? (shape.bellyHeight - z) / Math.max(1e-6, shape.bellyHeight - shape.bodyBottom)
      : (z - shape.bellyHeight) / Math.max(1e-6, shape.bodyTop - shape.bellyHeight);
    const barrel = shape.maxRadius * Math.pow(Math.max(0, 1 - Math.pow(fromBelly, shape.squareness)), 1 / shape.squareness);
    radii[sample] = Math.max(barrel, lower ? shape.bottomRadius : shape.topRadius);
  }
  const wantedRadii = Float64Array.from(radii);
  let steepestWanted = 0;
  for (let sample = 1; sample <= sampleCount; sample++) steepestWanted = Math.max(steepestWanted, Math.abs(radii[sample] - radii[sample - 1]) / sampleStep);
  const bottomSample = Math.min(sampleCount, Math.round(shape.bodyBottom / sampleStep));
  const topSample = Math.max(0, Math.round(shape.bodyTop / sampleStep));
  const maxStep = sampleStep * shape.maxTiltTan;   // largest radius change from one sample to the next
  for (let sample = bottomSample + 1; sample <= topSample; sample++) radii[sample] = Math.min(radii[sample], radii[sample - 1] + maxStep);
  for (let sample = topSample - 1; sample >= bottomSample; sample--) radii[sample] = Math.min(radii[sample], radii[sample + 1] + maxStep);
  /* Smoothing with a window that shrinks towards the necks, so they stay put. */
  const window = Math.round(3 / sampleStep);
  for (let pass = 0; pass < 2; pass++) {
    const runningSum = new Float64Array(sampleCount + 2);
    for (let sample = 0; sample <= sampleCount; sample++) runningSum[sample + 1] = runningSum[sample] + radii[sample];
    for (let sample = bottomSample + 1; sample < topSample; sample++) {
      const halfWidth = Math.min(window, sample - bottomSample, topSample - sample);
      if (halfWidth > 0) radii[sample] = (runningSum[sample + halfWidth + 1] - runningSum[sample - halfWidth]) / (2 * halfWidth + 1);
    }
  }
  const slopes = new Float64Array(sampleCount + 1);
  for (let sample = 0; sample <= sampleCount; sample++) {
    const before = Math.max(0, sample - 1), after = Math.min(sampleCount, sample + 1);
    slopes[sample] = (radii[after] - radii[before]) / ((after - before) * sampleStep);
  }
  return { radii, wantedRadii, slopes, wantedTilt: (Math.atan(steepestWanted) * 180) / Math.PI };
}

/* ---------- body ---------- */
/* Everything about the body at one height that does not depend on the angle. `threadZone` is 0 on
   the body, 1 on a threaded bottom neck and 2 on a threaded top neck. */
export function bodyRow(shape, z) {
  const row = { z, radius: 0, ringOffset: 0, ribRelief: 0, twist: 0, threadZone: 0, threadLeadIn: 1, threadRunout: 1, threadPhase: 0, threadDepth: 0 };
  const position = z / shape.sampleStep;
  const sample = Math.min(shape.sampleCount - 1, Math.max(0, Math.floor(position)));
  const fraction = clamp(position - sample, 0, 1);
  row.radius = shape.radii[sample] * (1 - fraction) + shape.radii[sample + 1] * fraction;
  row.radiusLeft = shape.twoSides ? shape.radiiLeft[sample] * (1 - fraction) + shape.radiiLeft[sample + 1] * fraction : row.radius;
  if (z >= shape.bodyBottom && z <= shape.bodyTop) {
    if (shape.rings > 0 && shape.ringRelief !== 0) {
      const ringSpacing = shape.bodyHeight / shape.rings;
      const ringPosition = (z - shape.bodyBottom) / ringSpacing;
      const fromRingCenter = (ringPosition - Math.floor(ringPosition) - 0.5) * ringSpacing;
      const ringWidth = shape.ringWidth;
      if (Math.abs(fromRingCenter) < ringWidth / 2) {
        const ring = Math.min(shape.rings - 1, Math.floor(ringPosition));
        row.ringOffset = shape.ringReliefs[ring] * 0.5 * (1 + Math.cos((TAU * fromRingCenter) / ringWidth));
      }
    }
    row.twist = (shape.twist * (z - shape.bodyBottom)) / shape.bodyHeight;
  } else {
    row.twist = z <= shape.bodyBottom ? 0 : shape.twist;
  }
  /* Ribs also run along plain necks; they only fade out towards a threaded neck, which has to
     stay round. */
  if (shape.ribRelief !== 0) {
    const fadeAboveBottomNeck = shape.bottomThread ? smoothstep(shape.bodyBottom, shape.bodyBottom + shape.ribFade, z) : 1;
    const fadeBelowTopNeck = shape.topThread ? smoothstep(shape.bodyTop, shape.bodyTop - shape.ribFade, z) : 1;
    row.ribRelief = shape.ribRelief * fadeAboveBottomNeck * fadeBelowTopNeck * (shape.ribsProportional ? row.radius / shape.maxRadius : 1);
  }
  /* The thread groove is cut fully at the free end of the neck (threadLeadIn 0) and fades out
     next to the body (threadRunout 0). */
  if (shape.bottomThread && z <= shape.bottomNeck) {
    row.threadZone = 1; row.threadDepth = shape.bottomThreadDepth;
    row.threadLeadIn = smoothstep(0, shape.bottomThreadRunout, z);
    row.threadRunout = 1 - smoothstep(shape.bottomNeck - shape.bottomThreadRunout, shape.bottomNeck, z);
    row.threadPhase = (TAU * z) / shape.pitch;
  } else if (shape.topThread && z >= shape.bodyTop) {
    const fromRim = shape.height - z;
    row.threadZone = 2; row.threadDepth = shape.topThreadDepth;
    row.threadLeadIn = smoothstep(0, shape.topThreadRunout, fromRim);
    row.threadRunout = 1 - smoothstep(shape.topNeck - shape.topThreadRunout, shape.topNeck, fromRim);
    row.threadPhase = (TAU * z) / shape.pitch;
  }
  return row;
}

/* Radius of the base profile at angle th: the right profile at θ = 0, the left one at θ = π, and a
   cosine blend in between, so the cross-section stays smooth and the wall never tilts more than
   the steeper of the two sides. */
function baseRadiusAt(row, th) {
  if (row.radiusLeft === row.radius) return row.radius;
  const frontShare = 0.5 + 0.5 * Math.cos(th);
  return row.radiusLeft + (row.radius - row.radiusLeft) * frontShare;
}
export function bodyR(shape, row, th) {
  const baseRadius = baseRadiusAt(row, th);
  let radius = baseRadius + row.ringOffset;
  if (row.ribRelief !== 0) {
    const ribPosition = ((th - row.twist) * shape.ribs) / TAU;
    const fromRibCenter = ribPosition - Math.round(ribPosition);
    const distance = Math.abs(fromRibCenter);
    const relief = shape.ribsProportional && row.radius > 0 ? (row.ribRelief * baseRadius) / row.radius : row.ribRelief;
    if (distance < shape.ribWidthShare / 2) {
      radius += relief * (shape.ribCrest
        ? 1 - Math.sin((Math.PI * distance) / shape.ribWidthShare)
        : 0.5 * (1 + Math.cos((TAU * fromRibCenter) / shape.ribWidthShare)));
    }
  }
  if (row.threadZone) {
    const onCrest = 0.5 + 0.5 * Math.cos(row.threadPhase - th);   // 1 on the thread crest, 0 in the groove
    radius -= row.threadDepth * (1 - row.threadLeadIn + row.threadLeadIn * row.threadRunout * (1 - onCrest));
  }
  return radius < 1.5 ? 1.5 : radius;   // relief never collapses the contour
}

/* ---------- caps: a regular solid part, smooth outside, with the female thread only on the inside.
   Printed with the closed face on the bed and the opening facing up. ---------- */
export function capSpec(shape, which) {
  const bottom = which === 'bottom';
  if (bottom ? !shape.bottomThread : !shape.topThread) return null;
  const threadLength = bottom ? shape.bottomNeck : shape.topNeck;
  const neckRadius = bottom ? shape.bottomRadius : shape.topRadius;
  const threadDepth = bottom ? shape.bottomThreadDepth : shape.topThreadDepth;
  const runout = bottom ? shape.bottomThreadRunout : shape.topThreadRunout;
  const floor = shape.capFloor, wall = shape.capWall;
  /* Through hole in the cap floor: at most large enough to leave a lip that sits on the neck rim. */
  const holeMax = Math.max(0, neckRadius - threadDepth - 0.5);
  const wantedHole = bottom ? shape.bottomHoleRadius : shape.topHoleRadius;
  const hole = wantedHole > 0 && holeMax >= 1 ? clamp(wantedHole, 1, holeMax) : 0;   // radius
  return {
    which, threadLength, neckRadius, threadDepth, runout, floor, wall, hole, holeMax,
    height: threadLength + floor,
    outerRadius: neckRadius + shape.clearance + wall,
    chamfer: Math.min(0.6, floor / 2, wall / 2),
    turns: Math.max(0, threadLength - 2 * runout) / shape.pitch,
  };
}
/* `grooveShare` fades the thread in above the cap floor and out at its rim. */
export function capRow(shape, cap, z) {
  return {
    z,
    twist: 0,
    grooveShare: smoothstep(cap.floor, cap.floor + cap.runout, z) * smoothstep(0, cap.runout, cap.height - z),
    threadPhase: (TAU * z) / shape.pitch,
  };
}
/* radius of the inner face of the cap */
export function capR(shape, cap, row, th) {
  const onCrest = 0.5 + 0.5 * Math.cos(row.threadPhase - th);
  return cap.neckRadius - cap.threadDepth + shape.clearance + cap.threadDepth * (1 - row.grooveShare * (1 - onCrest));
}
/* Contour rings: floor, chamfer, smooth outer wall, rim, then down the inner face to the floor.
   With creases=true the rings on sharp edges are duplicated so the preview renders them crisp. */
export function buildCap(shape, cap, segmentCount, dzTarget, creases) {
  const rings = [];
  const constant = (radius) => () => radius;
  const addRing = (z, radiusAt, crease) => {
    rings.push({ z, radiusAt });
    if (crease && creases) rings.push({ z, radiusAt });
  };
  addRing(0, constant(cap.outerRadius - cap.chamfer), true);
  addRing(cap.chamfer, constant(cap.outerRadius), true);
  addRing(cap.height, constant(cap.outerRadius), true);
  const innerSteps = Math.max(2, Math.ceil(cap.threadLength / dzTarget));
  for (let step = 0; step <= innerSteps; step++) {
    const z = cap.height - (cap.threadLength * step) / innerSteps;
    const row = capRow(shape, cap, z);
    addRing(z, (th) => capR(shape, cap, row, th), step === 0 || step === innerSteps);
  }
  /* With a hole the contour does not end on the axis: it goes down the hole wall and back to the first ring. */
  if (cap.hole > 0) { addRing(cap.floor, constant(cap.hole), true); addRing(0, constant(cap.hole), true); }
  const ringCount = rings.length;
  const positions = new Float32Array(segmentCount * ringCount * 3);
  let cursor = 0;
  for (let ring = 0; ring < ringCount; ring++) {
    for (let segment = 0; segment < segmentCount; segment++) {
      const th = (TAU * segment) / segmentCount;
      const radius = rings[ring].radiusAt(th);
      positions[cursor++] = radius * Math.cos(th); positions[cursor++] = radius * Math.sin(th); positions[cursor++] = rings[ring].z;
    }
  }
  return {
    positions, segmentCount, ringCount, height: cap.height, loop: cap.hole > 0,
    bottomCenter: [0, 0, 0], topCenter: [0, 0, cap.floor],
  };
}

/* ---------- (θ, z) grid meshing ---------- */
/* A ring mesh: `ringCount` rings of `segmentCount` vertices from the floor up to `height`, closed by
   a centre point at each end. It also keeps each vertex radius and each ring's height, twist and
   thread zone, which measure() uses. */
function grid(height, segmentCount, ringCount, rowAt, radiusAt) {
  const positions = new Float32Array(segmentCount * ringCount * 3);
  const radii = new Float32Array(segmentCount * ringCount);
  const ringHeights = new Float32Array(ringCount);
  const ringTwists = new Float32Array(ringCount);
  const ringZones = new Uint8Array(ringCount);
  let cursor = 0, vertex = 0;
  for (let ring = 0; ring < ringCount; ring++) {
    const z = (height * ring) / (ringCount - 1);
    const row = rowAt(z);
    ringHeights[ring] = z; ringTwists[ring] = row.twist; ringZones[ring] = row.threadZone || 0;
    for (let segment = 0; segment < segmentCount; segment++) {
      const th = (TAU * segment) / segmentCount + row.twist;
      const radius = radiusAt(row, th);
      radii[vertex++] = radius;
      positions[cursor++] = radius * Math.cos(th);
      positions[cursor++] = radius * Math.sin(th);
      positions[cursor++] = z;
    }
  }
  return {
    positions, radii, ringHeights, ringTwists, ringZones, segmentCount, ringCount, height,
    bottomCenter: [0, 0, 0], topCenter: [0, 0, height],
  };
}
/* Segments around: a multiple of the rib count, so every crest lands on a vertex. */
export function segments(shape, target, perRib) {
  if (shape.ribs > 0 && shape.ribRelief !== 0) return Math.max(shape.ribs * (perRib || 8), Math.round(target / shape.ribs) * shape.ribs);
  return target;
}
export function buildBody(shape, segmentTarget, dzTarget, perRib) {
  const segmentCount = segments(shape, segmentTarget, perRib);
  const ringCount = Math.max(3, Math.ceil(shape.height / dzTarget) + 1);
  return grid(shape.height, segmentCount, ringCount, (z) => bodyRow(shape, z), (row, th) => bodyR(shape, row, th));
}

/* ---------- measurements: area, maximum radius and wall tilt ---------- */
/* Wall tilt from vertical at every vertex (in `angles`, in radians, when wantAngles is set) and the
   steepest one on the body and on each threaded neck, in degrees. */
export function measure(mesh, wantAngles) {
  const { positions, radii, ringHeights, ringTwists, ringZones, segmentCount, ringCount } = mesh;
  const angleStep = TAU / segmentCount;
  let maxRadius = 0, area = 0;
  const steepestByZone = [0, 0, 0];
  const angles = wantAngles ? new Float32Array(segmentCount * ringCount) : null;
  for (let ring = 0; ring < ringCount; ring++) {
    const below = Math.max(0, ring - 1), above = Math.min(ringCount - 1, ring + 1);
    const verticalStep = ringHeights[above] - ringHeights[below];
    const twistRate = (ringTwists[above] - ringTwists[below]) / verticalStep;
    for (let segment = 0; segment < segmentCount; segment++) {
      const vertex = ring * segmentCount + segment;
      const radius = radii[vertex];
      if (radius > maxRadius) maxRadius = radius;
      const next = ring * segmentCount + ((segment + 1) % segmentCount);
      const previous = ring * segmentCount + ((segment + segmentCount - 1) % segmentCount);
      const radiusPerAngle = (radii[next] - radii[previous]) / (2 * angleStep);
      const radiusPerHeight = (radii[above * segmentCount + segment] - radii[below * segmentCount + segment]) / verticalStep - radiusPerAngle * twistRate;
      const tilt = Math.atan((radius * Math.abs(radiusPerHeight)) / Math.sqrt(radius * radius + radiusPerAngle * radiusPerAngle));
      if (angles) angles[vertex] = tilt;
      if (tilt > steepestByZone[ringZones[ring]]) steepestByZone[ringZones[ring]] = tilt;
      if (ring < ringCount - 1) {
        const nextSegment = (segment + 1) % segmentCount;
        const a = vertex * 3, b = (ring * segmentCount + nextSegment) * 3;
        const c = ((ring + 1) * segmentCount + nextSegment) * 3, d = ((ring + 1) * segmentCount + segment) * 3;
        area += triangleArea(positions, a, b, c) + triangleArea(positions, a, c, d);
      }
    }
  }
  const degrees = steepestByZone.map((radians) => (radians * 180) / Math.PI);
  return {
    maxRadius, area,
    overBody: degrees[0], overBottom: degrees[1], overTop: degrees[2], over: Math.max(degrees[0], degrees[1], degrees[2]),
    angles,
  };
}
/* Area of the triangle whose corners start at offsets a, b and c of `positions`. */
function triangleArea(positions, a, b, c) {
  const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
  const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  return 0.5 * Math.sqrt(x * x + y * y + z * z);
}

/* ---------- triangles of a ring mesh ---------- */
export const triCount = (segmentCount, ringCount) => 2 * segmentCount * (ringCount - 1) + 2 * segmentCount;
export const triCountOf = (mesh) => (mesh.loop ? 2 * mesh.segmentCount * mesh.ringCount : triCount(mesh.segmentCount, mesh.ringCount));

/* Visits the triangles with outward normals. A regular mesh is a stack of rings closed by its two
   centres; a loop mesh (a cap with a hole) joins the last ring back to the first. `put` receives
   the three corners as nine coordinates; a, b, c and d below are offsets into `positions`. */
export function eachTri(mesh, put) {
  const { positions, segmentCount, ringCount, bottomCenter, topCenter, loop } = mesh;
  const triangle = (a, b, c) => put(
    positions[a], positions[a + 1], positions[a + 2],
    positions[b], positions[b + 1], positions[b + 2],
    positions[c], positions[c + 1], positions[c + 2],
  );
  const centerTriangle = (center, a, b, centerFirst) => (centerFirst
    ? put(center[0], center[1], center[2], positions[a], positions[a + 1], positions[a + 2], positions[b], positions[b + 1], positions[b + 2])
    : put(positions[a], positions[a + 1], positions[a + 2], positions[b], positions[b + 1], positions[b + 2], center[0], center[1], center[2]));
  if (!loop) for (let segment = 0; segment < segmentCount; segment++) {
    centerTriangle(bottomCenter, ((segment + 1) % segmentCount) * 3, segment * 3, true);
  }
  for (let ring = 0; ring < (loop ? ringCount : ringCount - 1); ring++) {
    const nextRing = (ring + 1) % ringCount;
    for (let segment = 0; segment < segmentCount; segment++) {
      const nextSegment = (segment + 1) % segmentCount;
      const a = (ring * segmentCount + segment) * 3, b = (ring * segmentCount + nextSegment) * 3;
      const c = (nextRing * segmentCount + nextSegment) * 3, d = (nextRing * segmentCount + segment) * 3;
      triangle(a, b, c);
      triangle(a, c, d);
    }
  }
  const topRing = (ringCount - 1) * segmentCount;
  if (!loop) for (let segment = 0; segment < segmentCount; segment++) {
    centerTriangle(topCenter, (topRing + segment) * 3, (topRing + ((segment + 1) % segmentCount)) * 3, false);
  }
}

/* Enclosed volume, from the signed volumes of the tetrahedra each triangle makes with the origin. */
export function volume(mesh) {
  let total = 0;
  eachTri(mesh, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  });
  return total;
}
