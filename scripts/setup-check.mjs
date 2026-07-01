import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const install = args.has("--install");
const requiredNodeMajor = 20;

const checks = [
  { name: "node", command: "node", args: ["--version"], required: true, install: null },
  { name: "ffmpeg", command: "ffmpeg", args: ["-version"], required: false, install: "Install FFmpeg, for example: winget install Gyan.FFmpeg" },
  { name: "python", command: "python", args: ["--version"], required: false, install: "Install Python 3.10+, for example: winget install Python.Python.3.12" },
  { name: "yt-dlp", command: "yt-dlp", args: ["--version"], required: false, install: "python -m pip install -U yt-dlp" },
  { name: "whisper", command: "whisper", args: ["--help"], required: false, install: "python -m pip install -U openai-whisper" }
];

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  console.log("Checking Subtitle Review Loop requirements...");
  const results = [];
  for (const check of checks) {
    const result = await run(check.command, check.args, { allowFailure: true, timeoutMs: 8000 });
    results.push({ ...check, ok: result.code === 0, output: firstLine(result.stdout || result.stderr) });
  }

  const nodeResult = results.find((item) => item.name === "node");
  if (nodeResult?.ok) {
    const major = Number((nodeResult.output.match(/v?(\d+)/) || [])[1]);
    if (!Number.isFinite(major) || major < requiredNodeMajor) {
      nodeResult.ok = false;
      nodeResult.output = `${nodeResult.output} (requires Node.js ${requiredNodeMajor}+)`;
    }
  }

  for (const result of results) {
    console.log(`${result.ok ? "OK" : "MISSING"} ${result.name}${result.output ? ` - ${result.output}` : ""}`);
  }

  if (install) await installMissing(results);

  const missingRequired = results.filter((item) => item.required && !item.ok);
  if (missingRequired.length) {
    throw new Error(`Missing required tools: ${missingRequired.map((item) => item.name).join(", ")}`);
  }

  const missingOptional = results.filter((item) => !item.required && !item.ok);
  if (missingOptional.length) {
    console.log("");
    console.log("Optional tools are missing. Features that need them may not work:");
    for (const item of missingOptional) console.log(`- ${item.name}: ${item.install}`);
    console.log("Run npm run setup:install to install supported Python-based tools automatically.");
  }
}

async function installMissing(results) {
  const python = results.find((item) => item.name === "python");
  if (!python?.ok) {
    console.log("Python is missing; install Python first, then rerun npm run setup:install.");
    return;
  }

  if (!results.find((item) => item.name === "yt-dlp")?.ok) {
    console.log("Installing yt-dlp...");
    await run("python", ["-m", "pip", "install", "-U", "yt-dlp"], { timeoutMs: 120000 });
  }
  if (!results.find((item) => item.name === "whisper")?.ok) {
    console.log("Installing openai-whisper...");
    await run("python", ["-m", "pip", "install", "-U", "openai-whisper"], { timeoutMs: 600000 });
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      }
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 124, stdout, stderr: stderr || "Timed out" });
    }, options.timeoutMs || 30000);
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("error", (error) => {
      clearTimeout(timer);
      if (options.allowFailure) resolve({ code: 1, stdout, stderr: error.message });
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}
