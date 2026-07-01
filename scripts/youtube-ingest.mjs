import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const workspaceDir = path.join(root, "workspace");
const options = parseArgs(process.argv.slice(2));
const jsonOutput = Boolean(options.json);

if (!options.url) {
  fail("Missing YouTube URL. Usage: node scripts/youtube-ingest.mjs --url <youtube-url> [--rule workspace/rule.txt] [--force-whisper]");
}
if (!isAllowedYoutubeUrl(options.url)) {
  fail("Please provide a valid YouTube URL.");
}

main().catch((error) => fail(error.message));

async function main() {
  await ensureCommand("yt-dlp");
  await ensureCommand("ffmpeg");

  const metadata = options.forceWhisper
    ? createFastMetadata(options.url)
    : await readYoutubeMetadata(options.url);
  const videoId = metadata.id || extractVideoId(options.url) || `youtube-${Date.now()}`;
  const safeTitle = slugify(metadata.title || videoId).slice(0, 48) || videoId;
  const workDir = createUniqueWorkDir(`youtube-${videoId}-${safeTitle}`);
  mkdirSync(workDir, { recursive: true });

  const ruleSource = path.resolve(root, options.rule || path.join("workspace", "rule.txt"));
  const rulePath = path.join(workDir, "rule.txt");
  if (existsSync(ruleSource)) copyFileSync(ruleSource, rulePath);

  writeFileSync(
    path.join(workDir, "metadata.json"),
    `${JSON.stringify({ sourceUrl: options.url, importedAt: new Date().toISOString(), metadata }, null, 2)}\n`,
    "utf8"
  );

  log(`Workspace: ${relative(workDir)}`);
  let subtitlePath = null;
  if (options.forceWhisper) {
    log("Skipping YouTube captions. Downloading audio for Whisper transcription...");
  } else {
    log("Trying to download existing YouTube captions first...");
    subtitlePath = await tryDownloadSubtitles(options.url, workDir);
  }
  let draftPath = path.join(workDir, "draft.srt");
  let sourceMode = "youtube-subtitle";

  if (subtitlePath) {
    copyFileSync(subtitlePath, draftPath);
  } else {
    if (!options.forceWhisper) log("No reusable captions found. Downloading audio for Whisper transcription...");
    await ensureCommand("whisper");
    const audioPath = await downloadAudio(options.url, workDir);
    await runWhisper(audioPath, workDir);
    const whisperSrt = findFirstFile(workDir, [".srt"], ["draft", "rule-cleaned"]);
    if (!whisperSrt) throw new Error("Whisper finished but no SRT output was found.");
    copyFileSync(whisperSrt, draftPath);
    sourceMode = "whisper-transcription";
  }

  const cleanedPath = path.join(workDir, "rule-cleaned.srt");
  const reportPath = path.join(workDir, "rule-cleaned-report.md");
  await run("node", ["src/apply_subtitle_rules.mjs", draftPath, cleanedPath, reportPath], { cwd: root });
  const timingReport = repairSrtTiming(cleanedPath);

  const verificationPath = path.join(workDir, "youtube-ingest-verification.md");
  writeFileSync(verificationPath, renderVerification({ metadata, workDir, draftPath, cleanedPath, reportPath, sourceMode, timingReport }), "utf8");

  const result = {
    ok: true,
    mode: sourceMode,
    videoId,
    title: metadata.title || videoId,
    folder: relative(workDir),
    subtitle: relative(cleanedPath),
    draftSubtitle: relative(draftPath),
    report: relative(reportPath),
    verification: relative(verificationPath),
    rule: existsSync(rulePath) ? relative(rulePath) : null,
    sourceUrl: options.url
  };

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    log(`Done: ${result.subtitle}`);
    log(`Report: ${result.report}`);
  }

  if (shouldOpenEditor()) {
    await openEditorForResult(result);
  }
}

async function readYoutubeMetadata(url) {
  const output = await runCapture("yt-dlp", ["--dump-json", "--skip-download", "--no-playlist", url], { cwd: root });
  try {
    const line = output.trim().split(/\r?\n/).find(Boolean);
    return JSON.parse(line || "{}");
  } catch {
    return { webpage_url: url };
  }
}

function createFastMetadata(url) {
  const id = extractVideoId(url);
  return {
    id,
    title: id || "youtube",
    webpage_url: url,
    fastMetadata: true
  };
}

async function tryDownloadSubtitles(url, workDir) {
  await run("yt-dlp", [
    "--skip-download",
    "--no-playlist",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "zh-Hant,zh-TW,zh,zh-Hans,zh-CN,en",
    "--convert-subs",
    "srt",
    "-o",
    path.join(workDir, "youtube.%(ext)s"),
    url
  ], { cwd: root, allowFailure: true });

  const candidates = readdirSync(workDir)
    .filter((name) => name.toLowerCase().endsWith(".srt"))
    .filter((name) => name.toLowerCase().startsWith("youtube."))
    .sort((a, b) => subtitleRank(a) - subtitleRank(b))
    .map((name) => path.join(workDir, name));
  return candidates[0] || null;
}

function subtitleRank(name) {
  const lower = name.toLowerCase();
  if (lower.includes("zh-tw") || lower.includes("zh-hant")) return 0;
  if (lower.includes(".zh.")) return 1;
  if (lower.includes("zh-cn") || lower.includes("zh-hans")) return 2;
  if (lower.includes(".en.")) return 3;
  return 10;
}

async function downloadAudio(url, workDir) {
  await run("yt-dlp", [
    "--no-playlist",
    "-x",
    "--audio-format",
    "wav",
    "--audio-quality",
    "0",
    "-o",
    path.join(workDir, "audio.%(ext)s"),
    url
  ], { cwd: root });

  const audio = findFirstFile(workDir, [".wav", ".m4a", ".webm", ".mp3"], []);
  if (!audio) throw new Error("Audio download finished but no audio file was found.");
  return audio;
}

async function runWhisper(audioPath, workDir) {
  await run("whisper", [
    audioPath,
    "--model",
    options.model || "small",
    "--language",
    options.language || "Chinese",
    "--task",
    "transcribe",
    "--output_format",
    "srt",
    "--output_dir",
    workDir,
    "--verbose",
    "False"
  ], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1"
    }
  });
}

function repairSrtTiming(srtPath) {
  const source = readTextFile(srtPath);
  const blocks = source
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const timePattern = /^(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})$/;
  const cues = [];
  const errors = [];

  blocks.forEach((block, index) => {
    const lines = block.split(/\r?\n/);
    const match = lines[1]?.match(timePattern);
    if (!match || lines.length < 3) {
      errors.push(index + 1);
      return;
    }
    cues.push({
      start: parseSrtTime(match[1]),
      end: parseSrtTime(match[2]),
      text: lines.slice(2).join("\n")
    });
  });

  let overlapsFixed = 0;
  for (let index = 0; index < cues.length - 1; index += 1) {
    const cue = cues[index];
    const next = cues[index + 1];
    if (cue.end > next.start) {
      const repairedEnd = Math.max(cue.start + 100, next.start - 1);
      if (repairedEnd < cue.end) {
        cue.end = repairedEnd;
        overlapsFixed += 1;
      }
    }
  }

  let remainingOverlaps = 0;
  let nonPositiveDurations = 0;
  for (let index = 0; index < cues.length; index += 1) {
    if (cues[index].end <= cues[index].start) nonPositiveDurations += 1;
    if (index > 0 && cues[index].start < cues[index - 1].end) remainingOverlaps += 1;
  }

  const output = cues
    .map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`)
    .join("\n\n");
  writeFileSync(srtPath, `${output}\n`, "utf8");

  return {
    cueCount: cues.length,
    parseErrors: errors.length,
    overlapsFixed,
    remainingOverlaps,
    nonPositiveDurations
  };
}

function readTextFile(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8").replace(/^\uFEFF/, "") : "";
}

function parseSrtTime(value) {
  const [hours, minutes, rest] = value.split(":");
  const [seconds, milliseconds] = rest.split(",");
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(milliseconds);
}

function formatSrtTime(totalMilliseconds) {
  let value = Math.max(0, Math.round(totalMilliseconds));
  const hours = Math.floor(value / 3600000);
  value %= 3600000;
  const minutes = Math.floor(value / 60000);
  value %= 60000;
  const seconds = Math.floor(value / 1000);
  const milliseconds = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function renderVerification({ metadata, workDir, draftPath, cleanedPath, reportPath, sourceMode, timingReport }) {
  return [
    "# YouTube Subtitle Ingest Verification",
    "",
    `- Source URL: ${options.url}`,
    `- Video ID: ${metadata.id || "unknown"}`,
    `- Title: ${metadata.title || "unknown"}`,
    `- Duration: ${metadata.duration ?? "unknown"} seconds`,
    `- Mode: ${sourceMode}`,
    `- Output folder: ${relative(workDir)}`,
    `- Draft subtitle: ${relative(draftPath)}`,
    `- Rule-cleaned subtitle: ${relative(cleanedPath)}`,
    `- Rule-cleaning report: ${relative(reportPath)}`,
    `- Cue count: ${timingReport.cueCount}`,
    `- Timing overlaps fixed: ${timingReport.overlapsFixed}`,
    `- Remaining timing overlaps: ${timingReport.remainingOverlaps}`,
    `- Non-positive durations: ${timingReport.nonPositiveDurations}`,
    `- SRT parse errors: ${timingReport.parseErrors}`,
    "",
    "## Notes",
    "- Existing YouTube captions are preferred when available.",
    "- If no captions are available, the workflow downloads audio and runs local Whisper transcription.",
    "- Review YouTube access rights and course terminology before publishing final subtitles.",
    ""
  ].join("\n");
}

async function ensureCommand(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const args = [command];
  const result = await run(checker, args, { cwd: root, allowFailure: true, quiet: true });
  if (result.code !== 0) {
    throw new Error(`Required command not found: ${command}. Please install it before importing YouTube URLs.`);
  }
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
      shell: false,
      windowsHide: true
    });
    let stderr = "";
    if (!options.quiet && !jsonOutput) child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (!options.quiet && !jsonOutput) process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      if (options.allowFailure) resolve({ code: 1, error });
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) resolve({ code, stderr });
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--open") parsed.open = true;
    else if (arg === "--no-open") parsed.noOpen = true;
    else if (arg === "--force-whisper") parsed.forceWhisper = true;
    else if (arg.startsWith("--")) parsed[arg.slice(2)] = args[index + 1] || "";
    else if (!parsed.url) parsed.url = arg;
    if (arg.startsWith("--") && !["--json", "--open", "--no-open", "--force-whisper"].includes(arg)) index += 1;
  }
  return parsed;
}

function shouldOpenEditor() {
  if (options.noOpen || jsonOutput) return false;
  return true;
}

function extractVideoId(value) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0];
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function isAllowedYoutubeUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function createUniqueWorkDir(baseName) {
  const stamp = timestamp();
  let candidate = path.join(workspaceDir, `${baseName}-${stamp}`);
  let counter = 2;
  while (existsSync(candidate)) {
    candidate = path.join(workspaceDir, `${baseName}-${stamp}-${counter}`);
    counter += 1;
  }
  mkdirSync(candidate, { recursive: true });
  return candidate;
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

async function openEditorForResult(result) {
  const query = new URLSearchParams({
    srt: result.subtitle,
    youtube: result.sourceUrl,
    project: result.folder
  });
  const url = `http://127.0.0.1:8787/src/subtitle-editor.html?${query.toString()}`;
  await ensureEditorServer();
  openBrowser(url);
  log(`Opened editor: ${url}`);
}

async function ensureEditorServer() {
  if (await canReachEditor()) return;
  const child = spawn(process.execPath, ["src/subtitle-editor-server.mjs"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    if (await canReachEditor()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Subtitle editor server did not become ready in time.");
}

function canReachEditor() {
  return new Promise((resolve) => {
    const request = (globalThis.fetch ? fetch("http://127.0.0.1:8787/src/subtitle-editor.html") : null);
    if (request) {
      request.then((response) => resolve(response.ok)).catch(() => resolve(false));
      return;
    }
    resolve(false);
  });
}

function openBrowser(url) {
  const platform = os.platform();
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function findFirstFile(dir, extensions, excludePrefixes) {
  const names = readdirSync(dir)
    .filter((name) => extensions.includes(path.extname(name).toLowerCase()))
    .filter((name) => !excludePrefixes.some((prefix) => name.toLowerCase().startsWith(prefix)))
    .sort();
  return names[0] ? path.join(dir, names[0]) : null;
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function log(message) {
  if (!jsonOutput) console.log(message);
}

function fail(message) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}
