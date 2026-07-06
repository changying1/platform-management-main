const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const ROOT = __dirname;
const FRONTEND_DIST = path.join(ROOT, "frontend", "dist");
const BACKEND_HOST = process.env.BACKEND_HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 9000);
const MEDIA_HOST = process.env.MEDIA_HOST || "127.0.0.1";
const MEDIA_PORT = Number(process.env.MEDIA_PORT || 8001);
const PORT = Number(process.env.GATEWAY_PORT || 8080);

const PROXY_PREFIXES = [
  "/api",
  "/admin",
  "/alarms",
  "/app",
  "/call",
  "/device",
  "/devices",
  "/fence",
  "/images",
  "/keyboard",
  "/logs",
  "/personnel",
  "/projects",
  "/static",
  "/team",
  "/video",
  "/ws",
];
const MEDIA_PREFIXES = ["/live", "/hls", "/record"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".apk": "application/vnd.android.package-archive",
};

function matchesPrefix(url, prefixes) {
  return prefixes.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
}

function shouldProxy(url) {
  return matchesPrefix(url, PROXY_PREFIXES) || matchesPrefix(url, MEDIA_PREFIXES);
}

function getProxyTarget(url) {
  if (matchesPrefix(url, MEDIA_PREFIXES)) {
    return { host: MEDIA_HOST, port: MEDIA_PORT };
  }
  return { host: BACKEND_HOST, port: BACKEND_PORT };
}

function proxyHttp(req, res) {
  const target = getProxyTarget(req.url || "/");
  const headers = {
    ...req.headers,
    host: `${target.host}:${target.port}`,
    "x-forwarded-host": req.headers.host || "",
    "x-forwarded-proto": req.socket.encrypted ? "https" : "http",
  };

  const proxyReq = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on("error", () => {});
    }
  );

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "backend_unavailable", message: error.message }));
  });

  req.pipe(proxyReq);
}

function sendFile(res, filePath) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": stat.size,
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveFrontend(req, res) {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    pathname = "/";
  }

  const requested = path.normalize(path.join(FRONTEND_DIST, pathname));
  const safe = requested.startsWith(FRONTEND_DIST);
  const hasExtension = Boolean(path.extname(pathname));
  const filePath = safe && hasExtension ? requested : path.join(FRONTEND_DIST, "index.html");

  sendFile(res, filePath);
}

const server = http.createServer((req, res) => {
  if (shouldProxy(req.url || "/")) {
    proxyHttp(req, res);
    return;
  }
  serveFrontend(req, res);
});

server.on("connection", (socket) => {
  socket.on("error", () => {
    // silently ignore client socket errors (e.g. ECONNRESET)
  });
});

server.on("clientError", (err, socket) => {
  console.error(`Client error: ${err.code}`);
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  } else {
    socket.destroy();
  }
});

server.on("upgrade", (req, socket, head) => {
  if (!shouldProxy(req.url || "/")) {
    socket.destroy();
    return;
  }

  const target = getProxyTarget(req.url || "/");
  const backend = net.connect(target.port, target.host, () => {
    backend.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(req.headers)) {
      if (name.toLowerCase() === "host") continue;
      backend.write(`${name}: ${value}\r\n`);
    }
    backend.write(`host: ${target.host}:${target.port}\r\n`);
    backend.write("\r\n");
    if (head && head.length) backend.write(head);
    socket.pipe(backend).pipe(socket);
  });

  backend.on("error", () => socket.destroy());
  socket.on("error", () => backend.destroy());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway listening on http://0.0.0.0:${PORT}`);
  console.log(`Frontend dist: ${FRONTEND_DIST}`);
  console.log(`Proxy target: http://${BACKEND_HOST}:${BACKEND_PORT}`);
  console.log(`Media target: http://${MEDIA_HOST}:${MEDIA_PORT}`);
});
