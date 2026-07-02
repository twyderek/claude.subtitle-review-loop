import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const buildRoot = path.join(root, "dist");
const packageDir = path.join(buildRoot, "subtitle-review-toolkit");

await fs.rm(packageDir, { recursive: true, force: true });
await fs.mkdir(path.join(packageDir, "src"), { recursive: true });
await fs.mkdir(path.join(packageDir, "scripts"), { recursive: true });
await fs.mkdir(path.join(packageDir, "input"), { recursive: true });
await fs.mkdir(path.join(packageDir, "output"), { recursive: true });

await copyTextWithReplacements(
  path.join(root, "src", "subtitle-editor.html"),
  path.join(packageDir, "src", "subtitle-editor.html"),
  [
    ['../workspace/media.mp4', '../input/media.mp4'],
    ['../workspace/media.rule-cleaned.srt', '../input/media.srt'],
    ['workspace/media.mp4', 'input/media.mp4'],
    ['workspace/media.rule-cleaned.srt', 'input/media.srt'],
    ['workspace/review-output', 'output'],
    ['workspace/review-output/media.edited.srt', 'output/media.edited.srt'],
    ['workspace/review-output/media_subtitled_sample_20s.mp4', 'output/media_subtitled_sample_20s.mp4'],
    ['workspace/review-output/media_subtitled.mp4', 'output/media_subtitled.mp4'],
    ['workspace/review-output/burn-settings.json', 'output/burn-settings.json'],
    ['字幕校稿與燒錄預覽', '字幕校對工具包'],
  ],
);

await copyTextWithReplacements(
  path.join(root, "src", "subtitle-editor-server.mjs"),
  path.join(packageDir, "src", "subtitle-editor-server.mjs"),
  [
    ['path.join(root, "workspace", "review-output")', 'path.join(root, "output")'],
  ],
);

await copyFile(path.join(root, "scripts", "start-editor.mjs"), path.join(packageDir, "scripts", "start-editor.mjs"));

await writeText(
  path.join(packageDir, "package.json"),
  `${JSON.stringify({
    name: "subtitle-review-toolkit",
    version: "1.0.0",
    private: true,
    type: "module",
    description: "Portable local subtitle review web tool.",
    scripts: {
      start: "node src/subtitle-editor-server.mjs",
      open: "node scripts/start-editor.mjs",
    },
    engines: {
      node: ">=20",
    },
  }, null, 2)}\n`,
);

await writeText(
  path.join(packageDir, "啟動字幕校對工具.cmd"),
  `@echo off\r\nchcp 65001 >nul\r\nsetlocal\r\ncd /d "%~dp0"\r\n\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo 找不到 Node.js。\r\n  echo 請先安裝 Node.js 20 或更新版本，然後再次雙擊本檔案。\r\n  echo.\r\n  echo Windows 安裝指令範例：\r\n  echo winget install OpenJS.NodeJS.LTS\r\n  echo.\r\n  pause\r\n  exit /b 1\r\n)\r\n\r\nnode scripts\\start-editor.mjs\r\n`,
);

await writeText(
  path.join(packageDir, "使用說明.txt"),
  `字幕校對工具包使用說明\r\n\r\n1. 第一次使用前，請確認電腦已安裝 Node.js 20 或更新版本。\r\n   Windows 可使用：winget install OpenJS.NodeJS.LTS\r\n\r\n2. 將要校對的影片放到 input 資料夾，建議命名為：media.mp4\r\n\r\n3. 將要校對的字幕放到 input 資料夾，建議命名為：media.srt\r\n   如果檔名不同，也可以開啟網頁後用「載入影片」「載入 SRT」手動選取。\r\n\r\n4. 雙擊「啟動字幕校對工具.cmd」。\r\n   系統會啟動本機服務並自動開啟瀏覽器。\r\n   使用期間請不要關閉命令提示字元視窗。\r\n\r\n5. 第一階段「字幕校稿」：一邊看影片一邊修正字幕錯字、斷句與專有名詞。\r\n\r\n6. 第二階段「燒錄預覽」：設定字幕字型、大小、位置、顏色、外框與粗體。\r\n\r\n7. 按「儲存校稿包」後，output 資料夾會產生：\r\n   - media.edited.srt：修正後字幕檔\r\n   - burn-settings.json：燒錄字幕設定\r\n   - burn-settings.ffmpeg-style.txt：FFmpeg force_style 參考\r\n   - export-manifest.json：輸出摘要\r\n\r\n8. 本工具包只負責字幕校對與燒錄樣式設定，不會自動轉錄影片，也不會自動燒錄影片。\r\n`,
);

await writeText(
  path.join(packageDir, "input", "請把影片與字幕放這裡.txt"),
  `請將待校對檔案放在本資料夾：\r\n\r\n建議檔名：\r\n- media.mp4：影片檔\r\n- media.srt：字幕檔\r\n\r\n也可以在網頁開啟後，用「載入影片」與「載入 SRT」手動選取其他檔名。\r\n`,
);

await writeText(
  path.join(packageDir, "output", "校稿輸出會在這裡.txt"),
  `按下網頁中的「儲存校稿包」後，這裡會產生：\r\n\r\n- media.edited.srt\r\n- burn-settings.json\r\n- burn-settings.ffmpeg-style.txt\r\n- export-manifest.json\r\n\r\n這些檔案可交給後續 FFmpeg 燒字幕流程使用。\r\n`,
);

console.log(`Portable toolkit prepared: ${packageDir}`);

async function copyFile(source, target) {
  await fs.copyFile(source, target);
}

async function copyTextWithReplacements(source, target, replacements) {
  let text = await fs.readFile(source, "utf8");
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  await writeText(target, text);
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}
