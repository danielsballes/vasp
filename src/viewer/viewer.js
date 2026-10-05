import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Group, Mesh,
  MeshStandardMaterial, BufferGeometry, BufferAttribute, Float32BufferAttribute,
  LineSegments, LineBasicMaterial, DoubleSide,
} from 'three';
import { TAU, clamp } from '../core/geometry.js';
import { PLATE } from '../core/print.js';

/* 3D viewer: draws the body and the caps from the core meshes and lets the user orbit, pan and zoom.
   It knows nothing about Vue; the ViewerStage component feeds it the model and the view options.
   Throws if the browser cannot create a WebGL context. */
export function createViewer(canvas, stage) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 1, 5000);
  scene.add(camera);
  /* three.js uses physical light units: these intensities amount to soft studio lighting. */
  scene.add(new HemisphereLight(0xffffff, 0x3a2a1e, 1.7));
  const key = new DirectionalLight(0xffffff, 2.2); key.position.set(0.5, 0.9, 1); camera.add(key);
  const rim = new DirectionalLight(0xffffff, 0.55); rim.position.set(-1, 0.2, -0.6); camera.add(rim);

  /* The core works Z-up; three.js is Y-up. */
  const root = new Group(); root.rotation.x = -Math.PI / 2; scene.add(root);
  const mat = () => new MeshStandardMaterial({ roughness: 0.7, metalness: 0, side: DoubleSide });
  const body = new Mesh(new BufferGeometry(), mat());
  const capMat = mat();
  const capB = new Mesh(new BufferGeometry(), capMat);
  const capT = new Mesh(new BufferGeometry(), capMat);
  const gB = new Group(); gB.add(capB);
  const gT = new Group(); capT.rotation.x = Math.PI; gT.add(capT);
  root.add(body, gB, gT);

  const plate = (() => {
    const pts = [];
    const hx = PLATE.x / 2, hy = PLATE.y / 2;
    for (let i = 0; i <= 9; i++) {
      const t = -hx + (PLATE.x * i) / 9;
      pts.push(t, -hy, 0, t, hy, 0, -hx, t, 0, hx, t, 0);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return new LineSegments(geo, new LineBasicMaterial({ color: 0x9a8670, transparent: true, opacity: 0.4 }));
  })();
  root.add(plate);

  /* closed: 0 open at both ends, 1 bottom only, 2 bottom and end cap, 3 closed loop (cap with a hole) */
  function setGrid(mesh, g, closed) {
    const geo = mesh.geometry;
    const nR = g.nT * g.nZ;
    const loop = closed === 3;
    if (loop) closed = 0;
    const rows = loop ? g.nZ : g.nZ - 1;
    const nV = nR + (closed ? 2 : 0);
    const sig = g.nT + 'x' + g.nZ + 'c' + (loop ? 'L' : closed);
    if (geo.userData.sig !== sig) {
      const idx = new Uint32Array((g.nT * rows * 2 + closed * g.nT) * 3);
      let o = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < g.nT; i++) {
        const i2 = (i + 1) % g.nT, j2 = (j + 1) % g.nZ;
        const a = j * g.nT + i, b = j * g.nT + i2, c = j2 * g.nT + i2, d = j2 * g.nT + i;
        idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = a; idx[o++] = c; idx[o++] = d;
      }
      if (closed) {
        const top = (g.nZ - 1) * g.nT;
        for (let i = 0; i < g.nT; i++) {
          const i2 = (i + 1) % g.nT;
          idx[o++] = nR; idx[o++] = i2; idx[o++] = i;
          if (closed === 2) { idx[o++] = top + i; idx[o++] = top + i2; idx[o++] = nR + 1; }
        }
      }
      geo.setIndex(new BufferAttribute(idx, 1));
      geo.setAttribute('position', new BufferAttribute(new Float32Array(nV * 3), 3));
      geo.deleteAttribute('color');
      geo.deleteAttribute('normal');   // recomputed below for the new vertex count
      geo.userData.sig = sig;
    }
    const attr = geo.getAttribute('position');
    attr.array.set(g.pos);
    if (closed) { attr.array.set(g.c0, nR * 3); attr.array.set(g.c1, nR * 3 + 3); }
    attr.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  /* Camera: orbits a target at azimuth `az` and polar angle `pol`. The target is the centre of the
     model (height `cy`) moved by `pan`, in three.js world axes. `radius` is the model's bounding
     radius, which sets the distance at zoom 1. */
  const HOME = { az: 0.7, pol: 1.22, zoom: 1 };
  const ZOOM_MIN = 0.08, ZOOM_MAX = 4, POLE = 0.02;
  const cam = { ...HOME, cy: 100, radius: 140, pan: [0, 0, 0] };
  const halfFov = () => (camera.fov * Math.PI) / 360;
  function distance() {
    const aspect = (stage.clientWidth || 1) / (stage.clientHeight || 1);
    const hf = Math.atan(Math.tan(halfFov()) * aspect);
    return (cam.radius / Math.sin(Math.min(halfFov(), hf))) * 1.08 * cam.zoom;
  }
  function place() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = distance();
    const sp = Math.sin(cam.pol);
    const tx = cam.pan[0], ty = cam.cy + cam.pan[1], tz = cam.pan[2];
    camera.position.set(tx + dist * sp * Math.sin(cam.az), ty + dist * Math.cos(cam.pol), tz + dist * sp * Math.cos(cam.az));
    camera.near = Math.max(0.5, dist / 100); camera.far = dist * 10 + cam.radius * 8;
    camera.lookAt(tx, ty, tz);
    camera.updateProjectionMatrix();
  }
  let pending = 0, disposed = false;
  function render() {
    if (pending || disposed) return;
    pending = requestAnimationFrame(() => { pending = 0; if (disposed) return; place(); renderer.render(scene, camera); });
  }

  function orbitBy(dAz, dPol) {
    cam.az += dAz;
    cam.pol = clamp(cam.pol + dPol, POLE, Math.PI - POLE);
  }
  function zoomBy(factor) { cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX); }
  /* Moves the target across the screen plane by (dx, dy) pixels, so the model follows the pointer.
     The target stays within a few model radii, so the model cannot be lost out of reach. */
  function panBy(dx, dy) {
    const k = (2 * distance() * Math.tan(halfFov())) / (stage.clientHeight || 1);
    const s = Math.sin(cam.az), c = Math.cos(cam.az), sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    const right = [c, 0, -s], up = [-s * cp, sp, -c * cp];
    const limit = cam.radius * 3;
    for (let i = 0; i < 3; i++) cam.pan[i] = clamp(cam.pan[i] + (-dx * right[i] + dy * up[i]) * k, -limit, limit);
  }
  function resetView() {
    Object.assign(cam, HOME);
    cam.pan = [0, 0, 0];
    render();
  }

  /* Controls. Mouse: drag orbits; right or middle button, or Shift / Ctrl / Cmd + drag, pans; the
     wheel zooms. Touch: one finger orbits, two fingers pan and pinch-zoom. Double click resets.
     Keyboard (canvas focused): arrows orbit, Shift + arrows pan, + and - zoom, Home resets. */
  const ptrs = new Map();
  let panning = false;
  let gesture = null;          // two-finger gesture: { d: distance, x, y: midpoint }
  const twoFingers = () => {
    const [a, b] = [...ptrs.values()];
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
  };
  const onDown = (e) => {
    panning = e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey;
    if (e.button === 1) e.preventDefault();          // no middle-button autoscroll
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    gesture = ptrs.size === 2 ? twoFingers() : null;
  };
  const onMove = (e) => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) {
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (panning) panBy(dx, dy); else orbitBy(-dx * 0.008, -dy * 0.008);
    } else if (ptrs.size === 2) {
      const now = twoFingers();
      if (gesture) {
        if (now.d > 0) zoomBy(gesture.d / now.d);
        panBy(now.x - gesture.x, now.y - gesture.y);
      }
      gesture = now;
    }
    render();
  };
  const onUp = (e) => { ptrs.delete(e.pointerId); gesture = null; };
  const onWheel = (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); render(); };
  const onMenu = (e) => e.preventDefault();          // the right button pans
  const onKey = (e) => {
    const step = e.shiftKey ? 24 : 0.12;
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (move && e.shiftKey) panBy(move[0] * step, move[1] * step);
    else if (move) orbitBy(move[0] * step, move[1] * step);
    else if (e.key === '+' || e.key === '=') zoomBy(1 / 1.15);
    else if (e.key === '-' || e.key === '_') zoomBy(1.15);
    else if (e.key === 'Home' || e.key === '0') { resetView(); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    render();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', resetView);
  canvas.addEventListener('contextmenu', onMenu);
  canvas.addEventListener('keydown', onKey);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(render) : null;
  if (ro) ro.observe(stage); else window.addEventListener('resize', render);

  /* Layer-support map: vertex colours are given in linear space. */
  const lin = (c) => c.map((v) => Math.pow(v, 2.2));
  const cool = lin([0.54, 0.58, 0.69]), amber = lin([0.94, 0.71, 0.29]), red = lin([0.9, 0.28, 0.23]);
  function paint(g, ang, ratio) {
    const geo = body.geometry;
    let attr = geo.getAttribute('color');
    if (!attr || attr.count !== g.nT * g.nZ) { attr = new BufferAttribute(new Float32Array(g.nT * g.nZ * 3), 3); geo.setAttribute('color', attr); }
    const a = attr.array;
    for (let k = 0; k < ang.length; k++) {
      const t = ratio * Math.tan(ang[k]);     // share of the line left unsupported: 0 none, 1 all of it
      let c0 = cool, c1 = amber, f = clamp((t - 0.25) / 0.25, 0, 1);
      if (t > 0.5) { c0 = amber; c1 = red; f = clamp((t - 0.5) / 0.4, 0, 1); }
      a[k * 3] = c0[0] + (c1[0] - c0[0]) * f; a[k * 3 + 1] = c0[1] + (c1[1] - c0[1]) * f; a[k * 3 + 2] = c0[2] + (c1[2] - c0[2]) * f;
    }
    attr.needsUpdate = true;
  }

  /* S = { q, g, m, caps } from the model; V = { mode, heat, bodyColor, capColor } from the view. */
  function update(S, V) {
    const { q, g, m, caps } = S;
    setGrid(body, g, q.closed ? 1 : 0);
    if (V.heat) { paint(g, m.ang, q.lh / q.lw); body.material.vertexColors = true; body.material.color.set(0xffffff); }
    else { body.material.vertexColors = false; body.material.color.set(V.bodyColor); }
    body.material.needsUpdate = true;
    capMat.color.set(V.capColor);
    const show = V.mode !== 'body';
    const exploded = V.mode === 'exploded';
    let lo = 0, hi = q.H;
    gB.visible = show && !!caps.bottom;
    gT.visible = show && !!caps.top;
    if (gB.visible) {
      setGrid(capB, caps.bottom.g, caps.bottom.g.loop ? 3 : 2);
      const z0 = -caps.bottom.spec.floor;
      gB.position.z = z0 - (exploded ? caps.bottom.spec.L + 14 : 0);
      gB.rotation.z = (TAU * z0) / q.pitch;      // turns the cap so its thread meshes with the neck's
      lo = gB.position.z;
    }
    if (gT.visible) {
      setGrid(capT, caps.top.g, caps.top.g.loop ? 3 : 2);
      const zc = q.H + caps.top.spec.floor;
      gT.position.z = zc + (exploded ? caps.top.spec.L + 14 : 0);
      gT.rotation.z = (TAU * zc) / q.pitch;
      hi = gT.position.z;
    }
    plate.visible = !gB.visible;
    cam.cy = (lo + hi) / 2;
    cam.radius = Math.hypot((hi - lo) / 2, m.rMax);
    render();
  }

  function dispose() {
    disposed = true;
    if (pending) cancelAnimationFrame(pending);
    if (ro) ro.disconnect(); else window.removeEventListener('resize', render);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', resetView);
    canvas.removeEventListener('contextmenu', onMenu);
    canvas.removeEventListener('keydown', onKey);
    for (const m of [body, capB, capT, plate]) m.geometry.dispose();
    body.material.dispose(); capMat.dispose(); plate.material.dispose();
    renderer.dispose();
  }

  return { update, render, resetView, dispose };
}
