import express from 'express';
import multer from 'multer';
import { parseSTL } from './parse-stl.js';
import { sliceVertices } from './slice-stl.js';
import { exportBinarySTL } from './export-stl.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json());
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path === '/') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));

app.post('/slice', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const axis = (req.body.axis || 'z').toLowerCase();
  if (!['x', 'y', 'z'].includes(axis)) {
    return res.status(400).json({ error: 'Axis must be x, y, or z' });
  }
  const ratio = Math.max(0.01, Math.min(0.99, parseFloat(req.body.position) || 0.5));

  let vertices;
  try {
    const buf = Buffer.isBuffer(req.file.buffer) ? req.file.buffer : Buffer.from(req.file.buffer);
    const parsed = parseSTL(buf);
    vertices = parsed.vertices;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid STL file: ' + e.message });
  }

  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  let minVal = Infinity, maxVal = -Infinity;
  for (let i = axisIndex; i < vertices.length; i += 3) {
    if (vertices[i] < minVal) minVal = vertices[i];
    if (vertices[i] > maxVal) maxVal = vertices[i];
  }
  const position = minVal + (maxVal - minVal) * ratio;

  const { above, below } = sliceVertices(vertices, axis, position);

  const toB64 = (verts) => {
    if (!verts || verts.length === 0) return null;
    return exportBinarySTL(verts).toString('base64');
  };

  res.json({ above: toB64(above), below: toB64(below) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`STL Cutter running at http://localhost:${PORT}`));
