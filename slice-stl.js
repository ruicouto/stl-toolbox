/**
 * Slice a mesh (flat Float32Array of triangle vertices) by a plane along an axis.
 * Returns { above: Float32Array|null, below: Float32Array|null }.
 * Both halves are capped (closed) along the cut plane.
 * Pure math — no Three.js dependency.
 */

const EPS = 1e-8;
const SNAP_DIGITS = 5;

function lerpVec(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function distToPlane(v, axisIndex, planePos) {
  return v[axisIndex] - planePos;
}

function intersect(a, b, axisIndex, planePos) {
  const da = distToPlane(a, axisIndex, planePos);
  const db = distToPlane(b, axisIndex, planePos);
  if (Math.abs(da - db) < 1e-10) return null;
  const t = da / (da - db);
  return lerpVec(a, b, t);
}

function pushTri(arr, a, b, c) {
  arr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function clipTriangle(v0, v1, v2, axisIndex, planePos, above, below) {
  const da = distToPlane(v0, axisIndex, planePos);
  const db = distToPlane(v1, axisIndex, planePos);
  const dc = distToPlane(v2, axisIndex, planePos);

  if (da >= -EPS && db >= -EPS && dc >= -EPS) { pushTri(above, v0, v1, v2); return null; }
  if (da <= EPS && db <= EPS && dc <= EPS) { pushTri(below, v0, v1, v2); return null; }

  const cases = [
    [da, db, dc, v0, v1, v2],
    [db, dc, da, v1, v2, v0],
    [dc, da, db, v2, v0, v1],
  ];

  for (const [dA, dB, dC, vA, vB, vC] of cases) {
    if (dA >= -EPS && dB <= EPS && dC <= EPS) {
      const p = intersect(vA, vB, axisIndex, planePos) || vA;
      const q = intersect(vA, vC, axisIndex, planePos) || vA;
      pushTri(above, vA, p, q);
      pushTri(below, p, vB, vC);
      pushTri(below, p, vC, q);
      return [p, q];
    }
    if (dA <= EPS && dB >= -EPS && dC >= -EPS) {
      const p = intersect(vA, vB, axisIndex, planePos) || vA;
      const q = intersect(vA, vC, axisIndex, planePos) || vA;
      pushTri(below, vA, p, q);
      pushTri(above, p, vB, vC);
      pushTri(above, p, vC, q);
      return [p, q];
    }
  }
  return null;
}

// ---- Capping ----

function snapKey(v) {
  const r = (x) => x.toFixed(SNAP_DIGITS);
  return `${r(v[0])},${r(v[1])},${r(v[2])}`;
}

function buildEdgeLoops(edges) {
  if (edges.length === 0) return [];

  // Build adjacency using a multimap (handles duplicates).
  // Each edge contributes two directed half-edges.
  // We consume half-edges as we walk to handle duplicates correctly.
  const adj = new Map();
  const pts = new Map();

  for (const [a, b] of edges) {
    const ka = snapKey(a);
    const kb = snapKey(b);
    if (ka === kb) continue;
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push({ to: kb, used: false });
    adj.get(kb).push({ to: ka, used: false });
    if (!pts.has(ka)) pts.set(ka, a);
    if (!pts.has(kb)) pts.set(kb, b);
  }

  const loops = [];

  for (const [startKey] of adj) {
    // Find an unused half-edge from this vertex
    const startEdges = adj.get(startKey);
    const startHE = startEdges.find(e => !e.used);
    if (!startHE) continue;

    const loop = [pts.get(startKey)];
    startHE.used = true;

    // Mark the reverse half-edge as used too
    const reverseStart = adj.get(startHE.to);
    if (reverseStart) {
      const rev = reverseStart.find(e => !e.used && e.to === startKey);
      if (rev) rev.used = true;
    }

    let curKey = startHE.to;
    let safety = adj.size + 10;

    while (curKey !== startKey && safety-- > 0) {
      loop.push(pts.get(curKey));
      const curEdges = adj.get(curKey);
      if (!curEdges) break;
      const he = curEdges.find(e => !e.used);
      if (!he) break;
      he.used = true;
      // Mark reverse
      const revEdges = adj.get(he.to);
      if (revEdges) {
        const rev = revEdges.find(e => !e.used && e.to === curKey);
        if (rev) rev.used = true;
      }
      curKey = he.to;
    }

    if (curKey === startKey && loop.length >= 3) {
      loops.push(loop);
    }
  }
  return loops;
}

function projectTo2D(points, axisIndex) {
  const u = axisIndex === 0 ? 1 : 0;
  const v = axisIndex <= 1 ? 2 : 1;
  return points.map(p => [p[u], p[v]]);
}

function cross2D(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTriangle2D(p, a, b, c) {
  const d1 = cross2D(p, a, b);
  const d2 = cross2D(p, b, c);
  const d3 = cross2D(p, c, a);
  const threshold = 1e-10;
  return (d1 > threshold && d2 > threshold && d3 > threshold) ||
         (d1 < -threshold && d2 < -threshold && d3 < -threshold);
}

function isEar(pts2D, prev, cur, next, indices) {
  const a = pts2D[prev], b = pts2D[cur], c = pts2D[next];
  if (cross2D(a, b, c) <= 1e-12) return false;
  for (const idx of indices) {
    if (idx === prev || idx === cur || idx === next) continue;
    if (pointInTriangle2D(pts2D[idx], a, b, c)) return false;
  }
  return true;
}

function earClip(pts2D, pts3D) {
  const tris = [];
  const indices = pts3D.map((_, i) => i);

  // Ensure CCW winding in 2D
  let area = 0;
  for (let i = 0; i < indices.length; i++) {
    const j = (i + 1) % indices.length;
    area += pts2D[indices[i]][0] * pts2D[indices[j]][1];
    area -= pts2D[indices[j]][0] * pts2D[indices[i]][1];
  }
  if (area < 0) indices.reverse();

  let safety = indices.length * indices.length + 10;
  while (indices.length > 3 && safety-- > 0) {
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const prev = indices[(i - 1 + indices.length) % indices.length];
      const cur = indices[i];
      const next = indices[(i + 1) % indices.length];
      if (isEar(pts2D, prev, cur, next, indices)) {
        tris.push([pts3D[prev], pts3D[cur], pts3D[next]]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break;
  }
  if (indices.length === 3) {
    tris.push([pts3D[indices[0]], pts3D[indices[1]], pts3D[indices[2]]]);
  }
  return tris;
}

// Fallback: fan triangulation from centroid (works for convex and many simple concave shapes)
function fanTriangulate(pts3D) {
  if (pts3D.length < 3) return [];
  const cx = pts3D.reduce((s, p) => s + p[0], 0) / pts3D.length;
  const cy = pts3D.reduce((s, p) => s + p[1], 0) / pts3D.length;
  const cz = pts3D.reduce((s, p) => s + p[2], 0) / pts3D.length;
  const center = [cx, cy, cz];
  const tris = [];
  for (let i = 0; i < pts3D.length; i++) {
    const j = (i + 1) % pts3D.length;
    tris.push([center, pts3D[i], pts3D[j]]);
  }
  return tris;
}

function addCap(loops, axisIndex, planePos, aboveArr, belowArr) {
  // Determine which winding gives +axis normal.
  // 2D projection uses axes u,v. The cross product e_u × e_v:
  //   x-cut (axis=0): u=y(1), v=z(2) → y×z = +x → CCW = +axis
  //   y-cut (axis=1): u=x(0), v=z(2) → x×z = -y → CCW = -axis
  //   z-cut (axis=2): u=x(0), v=y(1) → x×y = +z → CCW = +axis
  const ccwIsPositiveAxis = (axisIndex !== 1);

  for (const loop of loops) {
    const pts2D = projectTo2D(loop, axisIndex);
    let tris = earClip(pts2D, loop);
    // Fallback if ear clipping didn't fully triangulate
    const expectedTris = loop.length - 2;
    if (tris.length < expectedTris) {
      tris = fanTriangulate(loop);
    }

    for (const [a, b, c] of tris) {
      if (ccwIsPositiveAxis) {
        // CCW winding → +axis normal → outward for "below" half
        pushTri(belowArr, a, b, c);
        // Reversed → -axis normal → outward for "above" half
        pushTri(aboveArr, a, c, b);
      } else {
        // CCW winding → -axis normal → outward for "above" half
        pushTri(aboveArr, a, b, c);
        // Reversed → +axis normal → outward for "below" half
        pushTri(belowArr, a, c, b);
      }
    }
  }
}

// ---- Main entry ----

export function sliceVertices(vertices, axis, position) {
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const above = [];
  const below = [];
  const cutEdges = [];

  for (let i = 0; i < vertices.length; i += 9) {
    const v0 = [vertices[i], vertices[i + 1], vertices[i + 2]];
    const v1 = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
    const v2 = [vertices[i + 6], vertices[i + 7], vertices[i + 8]];
    const edge = clipTriangle(v0, v1, v2, axisIndex, position, above, below);
    if (edge) cutEdges.push(edge);
  }

  const loops = buildEdgeLoops(cutEdges);
  addCap(loops, axisIndex, position, above, below);

  return {
    above: above.length ? new Float32Array(above) : null,
    below: below.length ? new Float32Array(below) : null,
  };
}
