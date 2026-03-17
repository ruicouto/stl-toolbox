/**
 * Parse a binary or ASCII STL from a Node Buffer.
 * Returns { vertices: Float32Array, normals: Float32Array }.
 * Each triangle = 3 consecutive vertices (9 floats) + 1 normal (3 floats, repeated 3×).
 */

function isBinarySTL(buf) {
  if (buf.length < 84) return false;
  const nFaces = buf.readUInt32LE(80);
  const expected = 80 + 4 + nFaces * 50;
  if (expected === buf.length) return true;
  const header = buf.subarray(0, 5).toString('ascii');
  return !header.startsWith('solid');
}

function parseBinary(buf) {
  const nFaces = buf.readUInt32LE(80);
  const vertices = new Float32Array(nFaces * 9);
  const normals = new Float32Array(nFaces * 9);
  let offset = 84;
  for (let f = 0; f < nFaces; f++) {
    const nx = buf.readFloatLE(offset); offset += 4;
    const ny = buf.readFloatLE(offset); offset += 4;
    const nz = buf.readFloatLE(offset); offset += 4;
    for (let v = 0; v < 3; v++) {
      const vi = f * 9 + v * 3;
      vertices[vi] = buf.readFloatLE(offset); offset += 4;
      vertices[vi + 1] = buf.readFloatLE(offset); offset += 4;
      vertices[vi + 2] = buf.readFloatLE(offset); offset += 4;
      normals[vi] = nx;
      normals[vi + 1] = ny;
      normals[vi + 2] = nz;
    }
    offset += 2;
  }
  return { vertices, normals };
}

function parseASCII(text) {
  const verts = [];
  const norms = [];
  let curNormal = [0, 0, 0];
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('facet normal')) {
      const parts = line.split(/\s+/);
      curNormal = [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])];
    } else if (line.startsWith('vertex')) {
      const parts = line.split(/\s+/);
      verts.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
      norms.push(curNormal[0], curNormal[1], curNormal[2]);
    }
  }
  return { vertices: new Float32Array(verts), normals: new Float32Array(norms) };
}

export function parseSTL(buf) {
  if (isBinarySTL(buf)) {
    return parseBinary(buf);
  }
  return parseASCII(buf.toString('utf8'));
}
