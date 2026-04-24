const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5500;
const ROOT = path.join(path.resolve(__dirname), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
  let rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  rel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.resolve(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

function sendFile(res, filePath, headOnly) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    if (headOnly) res.end();
    else res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  const u = new URL(req.url || "/", "http://127.0.0.1");
  let filePath = safeJoin(ROOT, u.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      return sendFile(res, filePath, req.method === "HEAD");
    }
    const withIndex = path.join(filePath, "index.html");
    fs.stat(withIndex, (e2, st2) => {
      if (!e2 && st2.isFile()) {
        return sendFile(res, withIndex, req.method === "HEAD");
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404");
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Local: http://127.0.0.1:" + PORT + "/");
});