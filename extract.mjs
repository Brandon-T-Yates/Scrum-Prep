/**
 * Regenerate data/questions.json from a legacy index.html that still embeds
 * const bank = [...]; bank.push(...). Run: node extract.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, "index.html"), "utf-8");
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) {
  console.error("No embedded script bank found in index.html. questions.json is the source of truth.");
  process.exit(1);
}

const script = scriptMatch[1];
const start = script.indexOf("const bank =");
const end = script.indexOf("const EXAM_SIZE");
if (start === -1 || end === -1) {
  console.error("Could not locate question bank in index.html.");
  process.exit(1);
}

const bankSetup = script.slice(start, end);
const bank = new Function(`${bankSetup}; return bank;`)();

const ordered = bank.map((q) => ({
  id: q.id,
  prompt: q.prompt,
  options: q.options,
  correct: q.correct,
  multi: q.multi,
  explanation: q.explanation,
  source: q.source ?? "",
  source_num: q.source_num ?? 0,
  edited: q.edited ?? false,
}));

const outDir = join(root, "data");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "questions.json");
writeFileSync(outPath, JSON.stringify(ordered, null, 2) + "\n", "utf-8");

const ids = ordered.map((q) => q.id);
console.log(`Extracted ${ordered.length} questions -> ${outPath}`);
console.log(`Unique IDs: ${new Set(ids).size}, range ${Math.min(...ids)}-${Math.max(...ids)}`);
