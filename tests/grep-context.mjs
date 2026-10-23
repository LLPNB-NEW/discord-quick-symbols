// 在 Discord 的 web 入口包里打印若干关键字符串的上下文，确认真实类名/DOM 结构。
import { readFileSync } from "node:fs";

const file = process.argv[2];
const needles = process.argv.slice(3);
const src = readFileSync(file, "utf8");

for (const needle of needles) {
  let from = 0;
  let count = 0;
  console.log("\n========== " + needle + " ==========");
  while (count < 6) {
    const idx = src.indexOf(needle, from);
    if (idx === -1) break;
    const start = Math.max(0, idx - 260);
    const end = Math.min(src.length, idx + 340);
    console.log("--- @" + idx + " ---");
    console.log(src.slice(start, end).replace(/\n/g, " "));
    from = idx + needle.length;
    count += 1;
  }
  if (count === 0) console.log("(no hit)");
}
