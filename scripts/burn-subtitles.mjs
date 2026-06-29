import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const { sampleMode, settingsPath, positional } = options;
const [videoArg, subtitleArg, outputArg] = positional;

const videoPath = path.resolve(videoArg || "workspace/media.mp4");
const subtitlePath = path.resolve(
  subtitleArg ||
    (fs.existsSync("workspace/review-output/media.edited.srt")
      ? "workspace/review-output/media.edited.srt"
      : "workspace/media.rule-cleaned.srt"),
);
const outputPath = path.resolve(
  outputArg ||
    (sampleMode
      ? "workspace/media_subtitled_sample_20s.mp4"
      : "workspace/media_subtitled.mp4"),
);

const style = buildStyle(loadSettings(settingsPath));

function escapeForFfmpegSubtitles(filePath) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):/, "$1\\:")
    .replace(/'/g, "\\'");
}

const subtitleFilter = [
  `subtitles='${escapeForFfmpegSubtitles(subtitlePath)}'`,
  "charenc=UTF-8",
  `force_style='${style}'`,
].join(":");

const args = [
  "-y",
  ...(sampleMode ? ["-ss", "00:00:10", "-t", "20"] : []),
  "-i",
  videoPath,
  "-vf",
  subtitleFilter,
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "22",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  sampleMode ? "aac" : "copy",
  ...(sampleMode ? ["-b:a", "128k"] : []),
  "-movflags",
  "+faststart",
  outputPath,
];

console.log(
  sampleMode
    ? "Burning 20-second subtitle sample with safe teaching-video style..."
    : "Burning subtitles with safe teaching-video style...",
);
console.log(`Video: ${videoPath}`);
console.log(`SRT: ${subtitlePath}`);
console.log(`Output: ${outputPath}`);
console.log(`Style: ${style}`);

const ffmpeg = spawn("ffmpeg", args, { stdio: "inherit" });
ffmpeg.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

function parseArgs(args) {
  const positional = [];
  let sample = false;
  let settings = "workspace/review-output/burn-settings.json";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--sample") {
      sample = true;
      continue;
    }
    if (arg === "--settings") {
      settings = args[index + 1] || settings;
      index += 1;
      continue;
    }
    positional.push(arg);
  }

  return { sampleMode: sample, settingsPath: settings, positional };
}

function loadSettings(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return defaultSettings();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
    return { ...defaultSettings(), ...parsed };
  } catch (error) {
    console.warn(`Could not read burn settings, using defaults: ${error.message}`);
    return defaultSettings();
  }
}

function defaultSettings() {
  return {
    fontFamily: "Microsoft JhengHei",
    fontSize: 14,
    fontColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 1,
    position: "bottom",
    marginV: 22,
    bold: true,
    alignment: 2,
  };
}

function buildStyle(settings) {
  const position = ["top", "middle", "bottom"].includes(settings.position) ? settings.position : "bottom";
  const alignment = Number(settings.alignment) || (position === "top" ? 8 : position === "middle" ? 5 : 2);
  return [
    `FontName=${settings.fontFamily || "Microsoft JhengHei"}`,
    `FontSize=${clampNumber(settings.fontSize, 8, 96, 14)}`,
    `Bold=${settings.bold ? 1 : 0}`,
    `PrimaryColour=${hexToAssColor(settings.fontColor, "#ffffff")}`,
    `OutlineColour=${hexToAssColor(settings.outlineColor, "#000000")}`,
    "BorderStyle=1",
    `Outline=${clampNumber(settings.outlineWidth, 0, 8, 1)}`,
    "Shadow=0",
    `Alignment=${alignment}`,
    `MarginV=${clampNumber(settings.marginV, 0, 300, 22)}`,
  ].join(",");
}

function hexToAssColor(hex, fallback) {
  const clean = normalizeColor(hex, fallback).slice(1);
  const red = clean.slice(0, 2);
  const green = clean.slice(2, 4);
  const blue = clean.slice(4, 6);
  return `&H00${blue}${green}${red}`.toUpperCase();
}

function normalizeColor(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
