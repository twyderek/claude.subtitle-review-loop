import { spawn } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const workspaceDir = path.join(root, "workspace");
const options = parseArgs(process.argv.slice(2));
const jsonOutput = Boolean(options.json);

if (!options.video) {
  fail("Missing video path. Usage: node scripts/local-ingest.mjs --video <path> [--rule workspace/rule.txt] [--open]");
}

main().catch((error) => fail(error.message));

async function main() {
  await ensureCommand("ffmpeg");
  await ensureCommand("whisper");

  const sourceVideo = path.resolve(root, options.video);
  if (!existsSync(sourceVideo)) throw new Error(`Video file not found: ${sourceVideo}`);

  const baseName = path.basename(sourceVideo, path.extname(sourceVideo));
  const workDir = createUniqueWorkDir(`local-${slugify(baseName).slice(0, 60) || "video"}`);
  const videoPath = path.join(workDir, `source${path.extname(sourceVideo) || ".mp4"}`);
  copyFileSync(sourceVideo, videoPath);

  const ruleSource = path.resolve(root, options.rule || path.join("workspace", "rule.txt"));
  const rulePath = path.join(workDir, "rule.txt");
  if (existsSync(ruleSource)) copyFileSync(ruleSource, rulePath);

  writeFileSync(
    path.join(workDir, "metadata.json"),
    `${JSON.stringify({ sourceVideo, importedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );

  await runWhisper(videoPath, workDir);
  const whisperSrt = path.join(workDir, `${path.basename(videoPath, path.extname(videoPath))}.srt`);
  if (!existsSync(whisperSrt)) throw new Error("Whisper finished but no SRT output was found.");

  const draftPath = path.join(workDir, "draft.srt");
  copyFileSync(whisperSrt, draftPath);

  const cleanedPath = path.join(workDir, "rule-cleaned.srt");
  const reportPath = path.join(workDir, "rule-cleaned-report.md");
  await run("node", ["src/apply_subtitle_rules.mjs", draftPath, cleanedPath, reportPath], { cwd: root });
  const timingReport = repairSrtTiming(cleanedPath);

  const verificationPath = path.join(workDir, "local-ingest-verification.md");
  writeFileSync(verificationPath, renderVerification({ workDir, videoPath, draftPath, cleanedPath, reportPath, timingReport }), "utf8");

  const result = {
    ok: true,
    mode: "local-whisper-transcription",
    folder: relative(workDir),
    video: relative(videoPath),
    subtitle: relative(cleanedPath),
    draftSubtitle: relative(draftPath),
    report: relative(reportPath),
    verification: relative(verificationPath),
    rule: existsSync(rulePath) ? relative(rulePath) : null
  };

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    console.log(`Done: ${result.subtitle}`);
    console.log(`Video: ${result.video}`);
  }

  if (shouldOpenEditor()) await openEditorForResult(result);
}

async function runWhisper(videoPath, workDir) {
  await run("whisper", [
    videoPath,
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
  const source = readFileSync(srtPath, "utf8").replace(/^\uFEFF/, "");
  const blocks = source.trim().split(/\r?\n\r?\n/).map((block) => block.trim()).filter(Boolean);
  const timePattern = /^(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})$/;
  const cues = [];
  let parseErrors = 0;

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const match = lines[1]?.match(timePattern);
    if (!match || lines.length < 3) {
      parseErrors += 1;
      continue;
    }
    cues.push({ start: parseSrtTime(match[1]), end: parseSrtTime(match[2]), text: lines.slice(2).join("\n") });
  }

  let overlapsFixed = 0;
  for (let index = 0; index < cues.length - 1; index += 1) {
    if (cues[index].end > cues[index + 1].start) {
      const repairedEnd = Math.max(cues[index].start + 100, cues[index + 1].start - 1);
      if (repairedEnd < cues[index].end) {
        cues[index].end = repairedEnd;
        overlapsFixed += 1;
      }
    }
  }

  let remainingOverlaps = 0;
  let nonPositiveDurations = 0;
  cues.forEach((cue, index) => {
    if (cue.end <= cue.start) nonPositiveDurations += 1;
    if (index > 0 && cue.start < cues[index - 1].end) remainingOverlaps += 1;
  });

  const output = cues.map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`).join("\n\n");
  writeFileSync(srtPath, `${output}\n`, "utf8");
  return { cueCount: cues.length, parseErrors, overlapsFixed, remainingOverlaps, nonPositiveDurations };
}

function renderVerification({ workDir, videoPath, draftPath, cleanedPath, reportPath, timingReport }) {
  return [
    "# Local Video Subtitle Ingest Verification",
    "",
    `- Output folder: ${relative(workDir)}`,
    `- Video: ${relative(videoPath)}`,
    `- Draft subtitle: ${relative(draftPath)}`,
    `- Rule-cleaned subtitle: ${relative(cleanedPath)}`,
    `- Rule-cleaning report: ${relative(reportPath)}`,
    `- Cue count: ${timingReport.cueCount}`,
    `- Timing overlaps fixed: ${timingReport.overlapsFixed}`,
    `- Remaining timing overlaps: ${timingReport.remainingOverlaps}`,
    `- Non-positive durations: ${timingReport.nonPositiveDurations}`,
    `- SRT parse errors: ${timingReport.parseErrors}`,
    ""
  ].join("\n");
}

async function ensureCommand(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = await run(checker, [command], { cwd: root, allowFailure: true, quiet: true });
  if (result.code !== 0) throw new Error(`Required command not found: ${command}.`);
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
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("") + "-" + [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
}

async function openEditorForResult(result) {
  const query = new URLSearchParams({ srt: result.subtitle, video: result.video, project: result.folder });
  const url = `http://127.0.0.1:8787/src/subtitle-editor.html?${query.toString()}`;
  await ensureEditorServer();
  openBrowser(url);
  if (!jsonOutput) console.log(`Opened editor: ${url}`);
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
  return fetch("http://127.0.0.1:8787/src/subtitle-editor.html")
    .then((response) => response.ok)
    .catch(() => false);
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

function slugify(value) {
  return String(value).normalize("NFKD").replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--open") parsed.open = true;
    else if (arg === "--no-open") parsed.noOpen = true;
    else if (arg.startsWith("--")) {
      parsed[arg.slice(2)] = args[index + 1] || "";
      index += 1;
    }
  }
  return parsed;
}

function shouldOpenEditor() {
  if (options.noOpen || jsonOutput) return false;
  return true;
}

function fail(message) {
  if (jsonOutput) process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  else console.error(`Error: ${message}`);
  process.exit(1);
}
