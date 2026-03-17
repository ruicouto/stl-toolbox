# SLT Toolbox

Cut STL files along the X, Y, or Z axis. Upload a file, preview, slice, and download closed parts (with caps). Includes a Preview tab for viewing STLs only.

## Run locally

```bash
npm install
npm start
```

Open **http://localhost:3000**

## Deploy

### Option 1: Render (free tier)

1. Push the repo to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service.
3. Connect the repo, set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Deploy. Render sets `PORT` automatically.

### Option 2: Railway

1. Push to GitHub, then [railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. Select the repo; Railway detects Node and runs `npm start`. No extra config needed.

### Option 3: Docker

```bash
docker build -t stl-toolbox .
docker run -p 3000:3000 stl-toolbox
```

Then run the same image on any host (VPS, AWS ECS, Fly.io, etc.). Use `-e PORT=80` if the host expects port 80.

### Option 4: VPS (e.g. DigitalOcean, Linode)

```bash
# On the server
git clone <your-repo-url>
cd STLCutter
npm ci --omit=dev
# Run with PM2 so it restarts on crash
npm install -g pm2
PORT=3000 pm2 start server.js --name stl-toolbox
pm2 save && pm2 startup
```

Put Nginx (or Caddy) in front as a reverse proxy and add HTTPS (e.g. Let’s Encrypt).

## Stack

- **Backend:** Node.js, Express, Multer, custom STL parse/slice/export (no Three.js on server).
- **Frontend:** Vanilla JS, Three.js (preview), no build step.
