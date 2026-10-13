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
  const keyLight = new DirectionalLight(0xffffff, 2.2); keyLight.position.set(0.5, 0.9, 1); camera.add(keyLight);
  const rimLight = new DirectionalLight(0xffffff, 0.55); rimLight.position.set(-1, 0.2, -0.6); camera.add(rimLight);

  /* The core works Z-up; three.js is Y-up. */
  const root = new Group(); root.rotation.x = -Math.PI / 2; scene.add(root);
  const newMaterial = () => new MeshStandardMaterial({ roughness: 0.7, metalness: 0, side: DoubleSide });
  const body = new Mesh(new BufferGeometry(), newMaterial());
  const capMaterial = newMaterial();
  const bottomCap = new Mesh(new BufferGeometry(), capMaterial);
  const topCap = new Mesh(new BufferGeometry(), capMaterial);
  const bottomCapGroup = new Group(); bottomCapGroup.add(bottomCap);
  const topCapGroup = new Group(); topCap.rotation.x = Math.PI; topCapGroup.add(topCap);
  root.add(body, bottomCapGroup, topCapGroup);

  /* The printer bed, as a grid of lines. */
  const plate = (() => {
    const lines = [];
    const halfX = PLATE.x / 2, halfY = PLATE.y / 2;
    for (let line = 0; line <= 9; line++) {
      const offset = -halfX + (PLATE.x * line) / 9;
      lines.push(offset, -halfY, 0, offset, halfY, 0, -halfX, offset, 0, halfX, offset, 0);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(lines, 3));
    return new LineSegments(geometry, new LineBasicMaterial({ color: 0x9a8670, transparent: true, opacity: 0.4 }));
  })();
  root.add(plate);

  /* Copies a core ring mesh into a three.js mesh. The triangle index is only rebuilt when the mesh
     layout changes. closed: 0 open at both ends, 1 bottom only, 2 bottom and end cap, 3 closed loop
     (a cap with a hole). */
  function setRingMesh(target, ringMesh, closed) {
    const geometry = target.geometry;
    const { segmentCount, ringCount } = ringMesh;
    const ringVertices = segmentCount * ringCount;
    const loop = closed === 3;
    if (loop) closed = 0;
    const bands = loop ? ringCount : ringCount - 1;
    const vertexCount = ringVertices + (closed ? 2 : 0);
    const layout = segmentCount + 'x' + ringCount + 'c' + (loop ? 'L' : closed);
    if (geometry.userData.layout !== layout) {
      const index = new Uint32Array((segmentCount * bands * 2 + closed * segmentCount) * 3);
      let cursor = 0;
      for (let ring = 0; ring < bands; ring++) for (let segment = 0; segment < segmentCount; segment++) {
        const nextSegment = (segment + 1) % segmentCount, nextRing = (ring + 1) % ringCount;
        /* the four corners of one quad between this ring and the next */
        const a = ring * segmentCount + segment, b = ring * segmentCount + nextSegment;
        const c = nextRing * segmentCount + nextSegment, d = nextRing * segmentCount + segment;
        index[cursor++] = a; index[cursor++] = b; index[cursor++] = c; index[cursor++] = a; index[cursor++] = c; index[cursor++] = d;
      }
      if (closed) {
        const topRing = (ringCount - 1) * segmentCount;
        const bottomCenter = ringVertices, topCenter = ringVertices + 1;
        for (let segment = 0; segment < segmentCount; segment++) {
          const nextSegment = (segment + 1) % segmentCount;
          index[cursor++] = bottomCenter; index[cursor++] = nextSegment; index[cursor++] = segment;
          if (closed === 2) { index[cursor++] = topRing + segment; index[cursor++] = topRing + nextSegment; index[cursor++] = topCenter; }
        }
      }
      geometry.setIndex(new BufferAttribute(index, 1));
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexCount * 3), 3));
      geometry.deleteAttribute('color');
      geometry.deleteAttribute('normal');   // recomputed below for the new vertex count
      geometry.userData.layout = layout;
    }
    const positions = geometry.getAttribute('position');
    positions.array.set(ringMesh.positions);
    if (closed) { positions.array.set(ringMesh.bottomCenter, ringVertices * 3); positions.array.set(ringMesh.topCenter, ringVertices * 3 + 3); }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  /* Camera: orbits a target at azimuth `azimuth` and polar angle `polar`. The target is the centre
     of the model (height `centerHeight`) moved by `pan`, in three.js world axes. `radius` is the
     model's bounding radius, which sets the distance at zoom 1. */
  const HOME = { azimuth: 0.7, polar: 1.22, zoom: 1 };
  const ZOOM_MIN = 0.08, ZOOM_MAX = 4, POLE = 0.02;
  const view = { ...HOME, centerHeight: 100, radius: 140, pan: [0, 0, 0] };
  const halfFov = () => (camera.fov * Math.PI) / 360;
  function distance() {
    const aspect = (stage.clientWidth || 1) / (stage.clientHeight || 1);
    const halfFovAcross = Math.atan(Math.tan(halfFov()) * aspect);
    return (view.radius / Math.sin(Math.min(halfFov(), halfFovAcross))) * 1.08 * view.zoom;
  }
  function placeCamera() {
    const width = stage.clientWidth || 1, height = stage.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const dist = distance();
    const sinPolar = Math.sin(view.polar);
    const targetX = view.pan[0], targetY = view.centerHeight + view.pan[1], targetZ = view.pan[2];
    camera.position.set(
      targetX + dist * sinPolar * Math.sin(view.azimuth),
      targetY + dist * Math.cos(view.polar),
      targetZ + dist * sinPolar * Math.cos(view.azimuth),
    );
    camera.near = Math.max(0.5, dist / 100); camera.far = dist * 10 + view.radius * 8;
    camera.lookAt(targetX, targetY, targetZ);
    camera.updateProjectionMatrix();
  }
  let pendingFrame = 0, disposed = false;
  function render() {
    if (pendingFrame || disposed) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      if (disposed) return;
      placeCamera();
      renderer.render(scene, camera);
    });
  }

  function orbitBy(deltaAzimuth, deltaPolar) {
    view.azimuth += deltaAzimuth;
    view.polar = clamp(view.polar + deltaPolar, POLE, Math.PI - POLE);
  }
  function zoomBy(factor) { view.zoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX); }
  /* Moves the target across the screen plane by (dx, dy) pixels, so the model follows the pointer.
     The target stays within a few model radii, so the model cannot be lost out of reach. */
  function panBy(dx, dy) {
    const unitsPerPixel = (2 * distance() * Math.tan(halfFov())) / (stage.clientHeight || 1);
    const sinAz = Math.sin(view.azimuth), cosAz = Math.cos(view.azimuth);
    const sinPolar = Math.sin(view.polar), cosPolar = Math.cos(view.polar);
    const screenRight = [cosAz, 0, -sinAz], screenUp = [-sinAz * cosPolar, sinPolar, -cosAz * cosPolar];
    const limit = view.radius * 3;
    for (let axis = 0; axis < 3; axis++) {
      view.pan[axis] = clamp(view.pan[axis] + (-dx * screenRight[axis] + dy * screenUp[axis]) * unitsPerPixel, -limit, limit);
    }
  }
  function resetView() {
    Object.assign(view, HOME);
    view.pan = [0, 0, 0];
    render();
  }

  /* Controls. Mouse: drag orbits; right or middle button, or Shift / Ctrl / Cmd + drag, pans; the
     wheel zooms. Touch: one finger orbits, two fingers pan and pinch-zoom. Double click resets.
     Keyboard (canvas focused): arrows orbit, Shift + arrows pan, + and - zoom, Home resets. */
  const pointers = new Map();
  let panning = false;
  let gesture = null;          // two-finger gesture: { spread: distance between fingers, x, y: midpoint }
  const twoFingers = () => {
    const [first, second] = [...pointers.values()];
    return {
      spread: Math.hypot(first[0] - second[0], first[1] - second[1]),
      x: (first[0] + second[0]) / 2,
      y: (first[1] + second[1]) / 2,
    };
  };
  const onDown = (event) => {
    panning = event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey;
    if (event.button === 1) event.preventDefault();          // no middle-button autoscroll
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    gesture = pointers.size === 2 ? twoFingers() : null;
  };
  const onMove = (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size === 1) {
      const dx = event.clientX - previous[0], dy = event.clientY - previous[1];
      if (panning) panBy(dx, dy); else orbitBy(-dx * 0.008, -dy * 0.008);
    } else if (pointers.size === 2) {
      const now = twoFingers();
      if (gesture) {
        if (now.spread > 0) zoomBy(gesture.spread / now.spread);
        panBy(now.x - gesture.x, now.y - gesture.y);
      }
      gesture = now;
    }
    render();
  };
  const onUp = (event) => { pointers.delete(event.pointerId); gesture = null; };
  const onWheel = (event) => { event.preventDefault(); zoomBy(Math.exp(event.deltaY * 0.0012)); render(); };
  const onMenu = (event) => event.preventDefault();          // the right button pans
  const onKey = (event) => {
    const step = event.shiftKey ? 24 : 0.12;
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (move && event.shiftKey) panBy(move[0] * step, move[1] * step);
    else if (move) orbitBy(move[0] * step, move[1] * step);
    else if (event.key === '+' || event.key === '=') zoomBy(1 / 1.15);
    else if (event.key === '-' || event.key === '_') zoomBy(1.15);
    else if (event.key === 'Home' || event.key === '0') { resetView(); event.preventDefault(); return; }
    else return;
    event.preventDefault();
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
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(render) : null;
  if (resizeObserver) resizeObserver.observe(stage); else window.addEventListener('resize', render);

  /* Layer-support map: vertex colours are given in linear space. */
  const toLinear = (color) => color.map((channel) => Math.pow(channel, 2.2));
  const cool = toLinear([0.54, 0.58, 0.69]), amber = toLinear([0.94, 0.71, 0.29]), red = toLinear([0.9, 0.28, 0.23]);
  /* `angles` holds the wall tilt of each vertex; `ratio` is layer height over line width. */
  function paintSupport(ringMesh, angles, ratio) {
    const geometry = body.geometry;
    const vertexCount = ringMesh.segmentCount * ringMesh.ringCount;
    let colors = geometry.getAttribute('color');
    if (!colors || colors.count !== vertexCount) {
      colors = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
      geometry.setAttribute('color', colors);
    }
    const rgb = colors.array;
    for (let vertex = 0; vertex < angles.length; vertex++) {
      const unsupported = ratio * Math.tan(angles[vertex]);     // share of the line left unsupported: 0 none, 1 all of it
      let from = cool, to = amber, mix = clamp((unsupported - 0.25) / 0.25, 0, 1);
      if (unsupported > 0.5) { from = amber; to = red; mix = clamp((unsupported - 0.5) / 0.4, 0, 1); }
      for (let channel = 0; channel < 3; channel++) rgb[vertex * 3 + channel] = from[channel] + (to[channel] - from[channel]) * mix;
    }
    colors.needsUpdate = true;
  }

  /* model = { shape, mesh, measures, caps } from the model; options = { mode, heat, bodyColor,
     capColor } from the view. */
  function update(model, options) {
    const { shape, mesh, measures, caps } = model;
    setRingMesh(body, mesh, shape.closedBase ? 1 : 0);
    if (options.heat) {
      paintSupport(mesh, measures.angles, shape.layerHeight / shape.lineWidth);
      body.material.vertexColors = true; body.material.color.set(0xffffff);
    } else {
      body.material.vertexColors = false; body.material.color.set(options.bodyColor);
    }
    body.material.needsUpdate = true;
    capMaterial.color.set(options.capColor);
    const showCaps = options.mode !== 'body';
    const exploded = options.mode === 'exploded';
    let lowest = 0, highest = shape.height;
    bottomCapGroup.visible = showCaps && !!caps.bottom;
    topCapGroup.visible = showCaps && !!caps.top;
    if (bottomCapGroup.visible) {
      setRingMesh(bottomCap, caps.bottom.mesh, caps.bottom.mesh.loop ? 3 : 2);
      const capBase = -caps.bottom.spec.floor;
      bottomCapGroup.position.z = capBase - (exploded ? caps.bottom.spec.threadLength + 14 : 0);
      bottomCapGroup.rotation.z = (TAU * capBase) / shape.pitch;      // turns the cap so its thread meshes with the neck's
      lowest = bottomCapGroup.position.z;
    }
    if (topCapGroup.visible) {
      setRingMesh(topCap, caps.top.mesh, caps.top.mesh.loop ? 3 : 2);
      const capBase = shape.height + caps.top.spec.floor;
      topCapGroup.position.z = capBase + (exploded ? caps.top.spec.threadLength + 14 : 0);
      topCapGroup.rotation.z = (TAU * capBase) / shape.pitch;
      highest = topCapGroup.position.z;
    }
    plate.visible = !bottomCapGroup.visible;
    view.centerHeight = (lowest + highest) / 2;
    view.radius = Math.hypot((highest - lowest) / 2, measures.maxRadius);
    render();
  }

  function dispose() {
    disposed = true;
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    if (resizeObserver) resizeObserver.disconnect(); else window.removeEventListener('resize', render);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', resetView);
    canvas.removeEventListener('contextmenu', onMenu);
    canvas.removeEventListener('keydown', onKey);
    for (const object of [body, bottomCap, topCap, plate]) object.geometry.dispose();
    body.material.dispose(); capMaterial.dispose(); plate.material.dispose();
    renderer.dispose();
  }

  return { update, render, resetView, dispose };
}
