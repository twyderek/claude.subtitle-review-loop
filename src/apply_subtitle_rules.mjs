import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] || "workspace/media.srt";
const outputPath = process.argv[3] || "workspace/media.rule-cleaned.srt";
const reportPath = process.argv[4] || "workspace/media.rule-cleaned-report.md";

if (!existsSync(inputPath)) {
  console.error(`錯誤：找不到輸入檔案 ${inputPath}`);
  console.error("請提供任意 SRT 輸入路徑，或使用預設 workspace/media.srt：");
  console.error("  node src/apply_subtitle_rules.mjs input.srt output.srt report.md");
  process.exit(1);
}

for (const filePath of [outputPath, reportPath]) {
  const outputDir = path.dirname(filePath);
  if (outputDir && outputDir !== "." && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

const source = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const counters = {
  fillerRemoved: 0,
  punctuationRemoved: 0,
  pronounsNormalized: 0,
  termsNormalized: 0,
  chineseNumbersConverted: 0,
  emptyCuesRemoved: 0
};

const blocks = source
  .split(/\r?\n\r?\n/)
  .map((block) => block.trim())
  .filter(Boolean);

const cleanedBlocks = blocks.map((block) => {
  const lines = block.split(/\r?\n/);
  if (lines.length < 3) return null;

  const timing = lines[1];
  const text = lines.slice(2).join(" ");
  const cleaned = cleanSubtitleText(text);
  if (!cleaned.trim()) {
    counters.emptyCuesRemoved += 1;
    return null;
  }

  return { timing, text: cleaned };
}).filter(Boolean);

writeFileSync(outputPath, `${cleanedBlocks.map((block, index) => [index + 1, block.timing, block.text].join("\n")).join("\n\n")}\n`, "utf8");
writeFileSync(reportPath, renderReport(blocks.length), "utf8");

console.log(`已清理 ${cleanedBlocks.length} 條字幕（移除了 ${counters.emptyCuesRemoved} 條空白條目）`);
console.log(`輸出：${outputPath}`);
console.log(`報告：${reportPath}`);

function cleanSubtitleText(value) {
  let text = value.trim();

  text = normalizeTerms(text);
  text = convertChineseNumbers(text);
  text = normalizePronouns(text);
  text = removeFillers(text);
  text = trimToneParticles(text);
  text = removeDisallowedPunctuation(text);
  text = normalizeSpaces(text);

  return text;
}

function normalizeTerms(value) {
  const replacements = [
    [/Whisper\s*Desktop/gi, "WHISPERDESKTOP"],
    [/\bwhisper\b/gi, "WHISPER"],
    [/\bEverkin\b/gi, "EVERCAM"],
    [/\bEvercam\b/gi, "EVERCAM"],
    [/\bEverCam\b/g, "EVERCAM"],
    [/\bopen\s*ai\b/gi, "OPENAI"],
    [/\bgpt[-\s]?4\b/gi, "GPT-4"],
    [/\bdall[-\s]?e\b/gi, "DALL-E"],
    [/\btoken\b/gi, "TOKEN"],
    [/\bdefault\b/gi, "DEFAULT"],
    [/\blms\b/gi, "LMS"],
    [/\bmoodle\b/gi, "MOODLE"],
    [/\be3\b/gi, "E3"],
    [/\bkm\s*plus\b/gi, "KMPLUS"],
    [/\bai\b/gi, "AI"],
    [/\bapi\b/gi, "API"]
  ];

  let text = value;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, (match) => {
      if (match === replacement) return match;
      counters.termsNormalized += 1;
      return replacement;
    });
  }
  return text;
}

function convertChineseNumbers(value) {
  return value.replace(/[零〇一二兩三四五六七八九十百千]+(?=(分鐘|秒|小時|個|段|次|種|年|月|日|點))/g, (match) => {
    const converted = parseChineseNumber(match);
    if (converted === null) return match;
    counters.chineseNumbersConverted += 1;
    return String(converted);
  });
}

function parseChineseNumber(value) {
  const digit = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "兩": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9
  };

  if ([...value].every((char) => char in digit)) {
    return Number([...value].map((char) => digit[char]).join(""));
  }

  if (value === "十") return 10;
  const tens = value.match(/^([一二兩三四五六七八九])?十([一二兩三四五六七八九])?$/);
  if (tens) {
    const left = tens[1] ? digit[tens[1]] : 1;
    const right = tens[2] ? digit[tens[2]] : 0;
    return left * 10 + right;
  }

  return null;
}

function normalizePronouns(value) {
  return value.replace(/他/g, () => {
    counters.pronounsNormalized += 1;
    return "它";
  });
}

function removeFillers(value) {
  const fillers = ["你知道吧", "對吧", "那個", "這個", "然後", "就是", "呃", "啊", "嗯"];
  let text = value;
  for (const filler of fillers) {
    text = text.replaceAll(filler, () => {
      counters.fillerRemoved += 1;
      return "  ";
    });
  }
  return text;
}

function trimToneParticles(value) {
  return value
    .replace(/所以呢/g, "所以")
    .replace(/之後呢/g, "之後")
    .replace(/的話呢/g, "的話")
    .replace(/時候呢/g, "時候")
    .replace(/這邊呢/g, "這邊")
    .replace(/老師呢/g, "老師");
}

function removeDisallowedPunctuation(value) {
  return value.replace(/[，。,.、：:；;「」『』（）()《》〈〉【】\[\]“”"']/g, () => {
    counters.punctuationRemoved += 1;
    return "  ";
  });
}

function normalizeSpaces(value) {
  return value
    .replace(/\t/g, " ")
    .replace(/ {3,}/g, "  ")
    .replace(/^ +| +$/g, "")
    .replace(/\s+([？！])/g, "$1");
}

function renderReport(blockCount) {
  return [
    "# Subtitle Rule-Cleaning Report",
    "",
    `- Source: ${inputPath}`,
    `- Output: ${outputPath}`,
    `- Cue count: ${blockCount}`,
    `- Fillers removed: ${counters.fillerRemoved}`,
    `- Punctuation removed: ${counters.punctuationRemoved}`,
    `- Pronouns normalized: ${counters.pronounsNormalized}`,
    `- Terms normalized: ${counters.termsNormalized}`,
    `- Chinese numbers converted: ${counters.chineseNumbersConverted}`,
    `- Empty cues removed: ${counters.emptyCuesRemoved}`,
    "",
    "## Applied Rules",
    "- Removed oral fillers listed in rule.txt.",
    "- Removed punctuation except question and exclamation marks.",
    "- Replaced deletion pauses with two half-width spaces where possible.",
    "- Converted common Chinese numerals before time/count units.",
    "- Normalized system/platform/model pronouns to 它.",
    "- Normalized listed technical terms to uppercase."
  ].join("\n");
}
