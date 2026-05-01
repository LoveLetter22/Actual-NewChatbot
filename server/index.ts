import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const app = express();
const httpServer = http.createServer(app);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.cwd();
const port = Number(process.env.PORT || 5000);
const apiPort = Number(process.env.PYTHON_PORT || 8000);

// Manually proxy /api/* to Python backend BEFORE any body parsing
// so the raw body stream is intact and SSE responses pipe through without buffering.
app.use("/api", (req, res) => {
  const options: http.RequestOptions = {
    hostname: "localhost",
    port: apiPort,
    path: "/api" + req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${apiPort}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.status(502).json({ error: "API server unavailable. Python backend may still be starting." });
    }
  });

  req.pipe(proxyReq, { end: true });
});

async function setupFrontend() {
  if (process.env.NODE_ENV === "production") {
    const publicDir = path.resolve(__dirname, "public");
    app.use(express.static(publicDir));
    app.use((_req, res) => res.sendFile(path.join(publicDir, "index.html")));
    return;
  }

  const vite = await createViteServer({
    root: rootDir,
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
      allowedHosts: true,
    },
    appType: "spa",
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      const template = await fs.readFile(path.resolve(rootDir, "index.html"), "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

await setupFrontend();

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Frontend server running on port ${port}`);
  console.log(`Proxying /api/* → Python backend on port ${apiPort}`);
});
