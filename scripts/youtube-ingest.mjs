import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspaceDir = path.join(root, "workspace");
const options = parseArgs(process.argv.slice(2));
const jsonOutput = Boolean(options.json);

if (!options.url) {
  fail("Missing YouTube URL. Usage: node scripts/youtube-ingest.mjs --url <youtube-url> [--rule workspace/rule.txt]");
}
if (!isAllowedYoutubeUrl(options.url)) {
  fail("Please provide a valid YouTube URL.");
}

main().catch((error) => fail(error.message));

async function main() {
  await ensureCommand("yt-dlp");
  await ensureCommand("ffmpeg");

  const metadata = await readYoutubeMetadata(options.url);
  const videoId = metadata.id || extractVideoId(options.url) || `youtube-${Date.now()}`;
  const safeTitle = slugify(metadata.title || videoId).slice(0, 48) || videoId;
  const workDir = path.join(workspaceDir, `youtube-${videoId}-${safeTitle}`);
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
  log("Trying to download existing YouTube captions first...");
  const subtitlePath = await tryDownloadSubtitles(options.url, workDir);
  let draftPath = path.join(workDir, "draft.srt");
  let sourceMode = "youtube-subtitle";

  if (subtitlePath) {
    copyFileSync(subtitlePath, draftPath);
  } else {
    log("No reusable captions found. Downloading audio for Whisper transcription...");
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

  const verificationPath = path.join(workDir, "youtube-ingest-verification.md");
  writeFileSync(verificationPath, renderVerification({ metadata, workDir, draftPath, cleanedPath, reportPath, sourceMode }), "utf8");

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

async function tryDownloadSubtitles(url, workDir) {
  const before = new Set(readdirSync(workDir));
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
    .filter((name) => !before.has(name) && name.toLowerCase().endsWith(".srt"))
    .map((name) => path.join(workDir, name));
  return candidates[0] || null;
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

function renderVerification({ metadata, workDir, draftPath, cleanedPath, reportPath, sourceMode }) {
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
    else if (arg.startsWith("--")) parsed[arg.slice(2)] = args[index + 1] || "";
    else if (!parsed.url) parsed.url = arg;
    if (arg.startsWith("--") && arg !== "--json") index += 1;
  }
  return parsed;
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
