/**
 * 极简静态服务器：给需要走 http 的测试页用（例如从 esm.sh 拉 Slate 的实验室页）。
 * 用法：node tests/serve.mjs [端口]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..");
const port = Number(process.argv[2] || 8765);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    const file = join(root, relative || "tests/harness.html");
    if (!file.startsWith(root)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    response.end(body);
  } catch (err) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found: " + (err && err.message));
  }
}).listen(port, "127.0.0.1", () => {
  console.log("serving " + root + " at http://127.0.0.1:" + port + "/");
});
