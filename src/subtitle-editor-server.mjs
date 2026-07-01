import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(process.cwd());
const port = 8787;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".srt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg"
};

const defaultReviewOutputDir = path.join(root, "workspace", "review-output");

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);

  if (req.method === "POST" && url === "/api/save-review-package") {
    try {
      const payload = await readJsonBody(req);
      const result = await saveReviewPackage(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/youtube-ingest") {
    try {
      const payload = await readJsonBody(req);
      const result = await ingestYoutube(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const target = path.resolve(root, url === "/" ? "src/subtitle-editor.html" : url.slice(1));

  if (!target.startsWith(path.resolve(root))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const contentType = types[path.extname(target).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.writeHead(416);
        res.end();
        return;
      }

      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      res.writeHead(206, {
        "Content-Type": contentType,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes"
      });
      fs.createReadStream(target, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes"
    });
    fs.createReadStream(target).pipe(res);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Subtitle editor: http://127.0.0.1:${port}/src/subtitle-editor.html`);
});

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function ingestYoutube(payload) {
  const youtubeUrl = String(payload?.url || "").trim();
  if (!isAllowedYoutubeUrl(youtubeUrl)) {
    throw new Error("Please provide a valid YouTube URL.");
  }

  const args = ["scripts/youtube-ingest.mjs", "--url", youtubeUrl, "--json"];
  if (payload?.rulePath) args.push("--rule", String(payload.rulePath));
  if (payload?.model) args.push("--model", String(payload.model));
  if (payload?.language) args.push("--language", String(payload.language));
  if (payload?.forceWhisper) args.push("--force-whisper");

  const output = await runNode(args);
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error("YouTube ingest did not return a result.");

  let result;
  try {
    result = JSON.parse(line);
  } catch {
    throw new Error("YouTube ingest returned an unreadable result.");
  }
  if (!result.ok) throw new Error(result.error || "YouTube ingest failed.");
  return result;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || stdout.trim() || `Node exited with code ${code}`));
    });
  });
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

async function saveReviewPackage(payload) {
  if (!payload || typeof payload.subtitle !== "string") {
    throw new Error("Missing subtitle text");
  }
  if (!payload.settings || typeof payload.settings !== "object") {
    throw new Error("Missing burn settings");
  }

  const reviewOutputDir = resolveOutputFolder(payload.settings.outputFolder);
  await fsp.mkdir(reviewOutputDir, { recursive: true });

  const subtitlePath = path.join(reviewOutputDir, "media.edited.srt");
  const settingsPath = path.join(reviewOutputDir, "burn-settings.json");
  const stylePath = path.join(reviewOutputDir, "burn-settings.ffmpeg-style.txt");
  const manifestPath = path.join(reviewOutputDir, "export-manifest.json");

  const settings = normalizeBurnSettings(payload.settings);
  const manifest = {
    ...(payload.manifest || {}),
    savedAt: new Date().toISOString(),
    files: {
      subtitle: relativePath(subtitlePath),
      settings: relativePath(settingsPath),
      ffmpegStyle: relativePath(stylePath),
      manifest: relativePath(manifestPath)
    }
  };

  await fsp.writeFile(subtitlePath, payload.subtitle.replace(/\r?\n/g, "\r\n"), "utf8");
  await fsp.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await fsp.writeFile(stylePath, `${buildFfmpegStyle(settings)}\n`, "utf8");
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    ok: true,
    folder: relativePath(reviewOutputDir),
    files: manifest.files
  };
}

function normalizeBurnSettings(settings) {
  const position = ["top", "middle", "bottom"].includes(settings.position) ? settings.position : "bottom";
  return {
    fontFamily: String(settings.fontFamily || "Microsoft JhengHei"),
    fontSize: clampNumber(settings.fontSize, 8, 96, 14),
    fontColor: normalizeColor(settings.fontColor, "#ffffff"),
    outlineColor: normalizeColor(settings.outlineColor, "#000000"),
    outlineWidth: clampNumber(settings.outlineWidth, 0, 8, 1),
    position,
    marginV: clampNumber(settings.marginV, 0, 300, 22),
    bold: Boolean(settings.bold),
    alignment: position === "top" ? 8 : position === "middle" ? 5 : 2
  };
}

function resolveOutputFolder(value) {
  const requested = String(value || "").trim();
  const fallback = defaultReviewOutputDir;
  if (!requested) return fallback;
  const resolved = path.resolve(root, requested);
  const workspace = path.resolve(root, "workspace");
  if (!resolved.startsWith(workspace)) return fallback;
  return resolved;
}

function buildFfmpegStyle(settings) {
  return [
    `FontName=${settings.fontFamily}`,
    `FontSize=${settings.fontSize}`,
    `Bold=${settings.bold ? 1 : 0}`,
    `PrimaryColour=${hexToAssColor(settings.fontColor)}`,
    `OutlineColour=${hexToAssColor(settings.outlineColor)}`,
    "BorderStyle=1",
    `Outline=${settings.outlineWidth}`,
    "Shadow=0",
    `Alignment=${settings.alignment}`,
    `MarginV=${settings.marginV}`
  ].join(",");
}

function hexToAssColor(hex) {
  const clean = normalizeColor(hex, "#ffffff").slice(1);
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

function relativePath(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}
