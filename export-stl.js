/**
 * Export a flat Float32Array of triangle vertices to binary STL (Node Buffer).
 * vertices: Float32Array with length = numTriangles * 9
 */
export function exportBinarySTL(vertices) {
  const numTriangles = vertices.length / 9;
  const bufLen = 80 + 4 + numTriangles * 50;
  const buf = Buffer.alloc(bufLen);
  buf.write('binary stl export', 0, 'ascii');
  buf.writeUInt32LE(numTriangles, 80);
  let offset = 84;
  for (let t = 0; t < numTriangles; t++) {
    const i = t * 9;
    const ax = vertices[i], ay = vertices[i + 1], az = vertices[i + 2];
    const bx = vertices[i + 3], by = vertices[i + 4], bz = vertices[i + 5];
    const cx = vertices[i + 6], cy = vertices[i + 7], cz = vertices[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    buf.writeFloatLE(nx / len, offset); offset += 4;
    buf.writeFloatLE(ny / len, offset); offset += 4;
    buf.writeFloatLE(nz / len, offset); offset += 4;
    buf.writeFloatLE(ax, offset); offset += 4;
    buf.writeFloatLE(ay, offset); offset += 4;
    buf.writeFloatLE(az, offset); offset += 4;
    buf.writeFloatLE(bx, offset); offset += 4;
    buf.writeFloatLE(by, offset); offset += 4;
    buf.writeFloatLE(bz, offset); offset += 4;
    buf.writeFloatLE(cx, offset); offset += 4;
    buf.writeFloatLE(cy, offset); offset += 4;
    buf.writeFloatLE(cz, offset); offset += 4;
    buf.writeUInt16LE(0, offset); offset += 2;
  }
  return buf;
}
