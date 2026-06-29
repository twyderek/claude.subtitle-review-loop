import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import process from "node:process";

const host = "127.0.0.1";
const port = 8787;
const editorPath = "/src/subtitle-editor.html";
const editorUrl = `http://${host}:${port}${editorPath}`;

function checkServer() {
  return new Promise((resolve) => {
    const request = http.get(editorUrl, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function openBrowser(url) {
  const platform = os.platform();
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function waitForServer(timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkServer()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function main() {
  if (await checkServer()) {
    console.log(`Subtitle editor is already running: ${editorUrl}`);
    openBrowser(editorUrl);
    return;
  }

  console.log("Starting Subtitle Review Loop server...");
  const server = spawn(process.execPath, ["src/subtitle-editor-server.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: false,
  });

  const stopServer = () => {
    if (!server.killed) server.kill();
  };
  process.on("SIGINT", stopServer);
  process.on("SIGTERM", stopServer);
  process.on("exit", stopServer);

  if (await waitForServer()) {
    console.log(`Opening subtitle editor: ${editorUrl}`);
    openBrowser(editorUrl);
    console.log("Keep this window open while editing subtitles.");
  } else {
    console.error("Server did not become ready in time.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

