// 在 Discord 的本地 HTTP 缓存里找原始 JS/CSS 字符串，用来确认真实 DOM 的类名。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const needles = (process.argv[3] || "channelTextArea,sendButton,buttons_").split(",");
const hits = new Map(needles.map((n) => [n, 0]));

for (const name of readdirSync(dir)) {
  const file = join(dir, name);
  let stat;
  try { stat = statSync(file); } catch { continue; }
  if (!stat.isFile() || stat.size > 30 * 1024 * 1024) continue;
  let buf;
  try { buf = readFileSync(file); } catch { continue; }
  for (const needle of needles) {
    const idx = buf.indexOf(needle);
    if (idx === -1) continue;
    hits.set(needle, hits.get(needle) + 1);
    const start = Math.max(0, idx - 120);
    const end = Math.min(buf.length, idx + 160);
    const text = buf.subarray(start, end).toString("utf8").replace(/[^\x20-\x7E\u4e00-\u9fff]/g, "·");
    console.log("[" + needle + "] " + name + "\n  " + text + "\n");
  }
}
console.log("files with hits:", Object.fromEntries(hits));
