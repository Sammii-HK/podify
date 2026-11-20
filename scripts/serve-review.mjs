import http from "node:http";
import fs from "node:fs/promises";
const files = {
  "/icon.svg": ["icon.svg", "image/svg+xml"],
  "/review.js": ["review.js", "text/javascript"],
  "/review.css": ["review.css", "text/css"],
};
const routes = new Set(["/", "/feed", "/progress", "/player"]);
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const entry =
      files[pathname] ??
      (routes.has(pathname) ? ["index.html", "text/html"] : null);
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; media-src 'none'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!entry || req.method !== "GET") {
      res.writeHead(404);
      res.end("Not part of the offline review.");
      return;
    }
    try {
      res.setHeader("Content-Type", entry[1]);
      res.end(
        await fs.readFile(
          new URL("../.podify-review/" + entry[0], import.meta.url),
        ),
      );
    } catch {
      res.writeHead(500);
      res.end("Build the offline review first.");
    }
  })
  .listen(4832, "127.0.0.1", () =>
    console.log(
      "Podify offline client review: http://127.0.0.1:4832; services disconnected.",
    ),
  );
