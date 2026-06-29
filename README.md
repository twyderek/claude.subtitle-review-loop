# Subtitle Review Loop for Codex

A reusable workflow for creating, reviewing, cleaning, and exporting video
subtitles with a human-in-the-loop quality gate.

This project is designed for teaching videos, course recordings, tutorials, and
screen-recorded lessons where ASR output needs human correction before final
delivery.

## Features

- Browser subtitle editor with video preview
- SRT cue editing, search, and jump-to-cue playback controls
- Rule-based subtitle cleanup script
- Safe FFmpeg burn-in subtitle script for teaching videos
- Local server with MP4 range request support
- One-click Windows launcher that starts the local server and opens the editor
- Human-in-the-loop subtitle correction workflow
- Reusable workflow and prompt documentation

## What This Repository Does Not Include

This repository intentionally does not include source videos, burned videos,
audio files, or real course transcript files. Put your own media and subtitle
files in a local `workspace/` folder.

## First-Time Setup

### Required Tools

- Node.js 20 or later
- Git
- A modern browser, such as Chrome, Edge, Firefox, or Safari

### Optional Tools

- FFmpeg, for extracting audio, checking media files, and burning subtitles
- Python 3.10 or later, if you want to run local Whisper transcription
- Whisper or another ASR tool, for generating draft SRT files

### Windows Installation Examples

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Gyan.FFmpeg
winget install Python.Python.3.12
python -m pip install --upgrade pip
python -m pip install -U openai-whisper
```

### macOS Installation Examples

```bash
brew install node git ffmpeg python
python3 -m pip install -U openai-whisper
```

### Linux Installation Examples

```bash
sudo apt update
sudo apt install -y nodejs npm git ffmpeg python3 python3-pip
python3 -m pip install -U openai-whisper
```

## Quick Start

Clone the repository:

```bash
git clone https://github.com/twyderek/claude.subtitle-review-loop.git
cd claude.subtitle-review-loop
```

Install dependencies:

```bash
npm install
```

Start the local subtitle editor and open it automatically:

```bash
npm run open
```

Or start only the local subtitle editor server:

```bash
npm run start
```

Then open:

```text
http://127.0.0.1:8787/src/subtitle-editor.html
```

Default expected local files:

```text
workspace/media.mp4
workspace/media.rule-cleaned.srt
```

You can also open the HTML page and manually choose a video and SRT file.

## One-Click Windows Launcher

Windows users can double-click this file from the project folder:

```text
start-subtitle-editor.cmd
```

The launcher checks whether `node` is available, starts the local subtitle
editor server, opens the browser automatically, and keeps the server running
while the command window stays open.

## Generate A Draft SRT

If you use local Whisper, put your video in `workspace/media.mp4`, then run:

```bash
whisper workspace/media.mp4 --language Chinese --task transcribe --output_format srt --output_dir workspace
```

On Windows, use UTF-8 environment variables to avoid `cp950` console crashes:

```powershell
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
whisper workspace/media.mp4 --model small --language Chinese --task transcribe --output_format all --output_dir workspace --verbose False
```

Rename or copy the generated SRT to the editor's default filename if needed:

```powershell
Copy-Item workspace\media.srt workspace\media.rule-cleaned.srt
```

## Apply Subtitle Rules

Prepare your editable SRT:

```text
workspace/media.srt
```

Run the cleanup script:

```bash
npm run clean:subtitles
```

Default outputs:

```text
workspace/media.rule-cleaned.srt
workspace/media.rule-cleaned-report.md
```

You can also pass custom paths:

```bash
node src/apply_subtitle_rules.mjs input.srt output.srt report.md
```

## Burn Subtitles With FFmpeg

After the browser review is complete, click `儲存校稿包` in the editor. The
editor writes the reviewed subtitle and burn settings to `workspace/review-output/`.

The review package contains:

- `media.edited.srt`
- `burn-settings.json`
- `burn-settings.ffmpeg-style.txt`
- `export-manifest.json`

Render a short sample first:

```bash
npm run sample:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled_sample_20s.mp4 --settings workspace/review-output/burn-settings.json
```

Only burn the full video after the sample screenshot confirms the subtitles do
not block important UI content:

```bash
npm run burn:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled.mp4 --settings workspace/review-output/burn-settings.json
```

The script uses a safe default style for screen-recorded teaching videos:

- bottom aligned
- small subtitle size
- thin black outline
- UTF-8 subtitle decoding
- Windows path escaping for FFmpeg

For manual FFmpeg debugging, the equivalent sample command is:

```bash
ffmpeg -y -ss 00:00:10 -t 20 -i workspace/media.mp4 -vf "subtitles='workspace/media.rule-cleaned.srt':charenc=UTF-8:force_style='FontName=Microsoft JhengHei,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=22'" -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart workspace/media_subtitled_sample_20s.mp4
```

## Recommended Workflow

1. Put the source video in `workspace/`.
2. Generate or provide a draft SRT.
3. Ask the user for glossary, spelling references, and a rule file.
4. Apply only the user-provided subtitle cleanup rules.
5. Produce correction report and terminology table.
6. Review the subtitles in browser editor stage 1.
7. Configure burn-in style in browser editor stage 2.
8. Save the review package to `workspace/review-output/`.
9. Render a short burned-subtitle sample and screenshot.
10. Burn the final MP4 only after the sample is approved.
11. Verify duration, resolution, audio, subtitle readability, and output files.

## Important Principle

Do not hard-code subtitle cleanup rules into the reusable prompt. Rules should
come from the user or project owner. If no rule file is provided, perform only
neutral mechanical checks such as SRT parsing, empty cue detection, timecode
overlap detection, cue length warnings, and encoding checks.

## Documentation

- [Complete Workflow](docs/VIDEO-SUBTITLE-WORKFLOW.md)
- [Project Documentation - Traditional Chinese](docs/PROJECT-DOCUMENTATION-ZH.md)
- [Technical Document - DOCX](docs/PROJECT-TECHNICAL-DOCUMENT-ZH.docx)
- [Technical Document - Markdown](docs/PROJECT-TECHNICAL-DOCUMENT-ZH.md)
- [Workflow Diagram - Excalidraw](docs/subtitle-review-loop-workflow.excalidraw)
- [Reusable Loop Prompt](docs/VIDEO-FACTORY-LOOP-PROMPT.md)
- [Runbook: Issues And Fixes](docs/RUNBOOK-ISSUES-AND-FIXES.md)
- [Editor Notes](docs/subtitle-editor-readme.md)

## 繁體中文使用說明

### 專案用途

`Subtitle Review Loop for Codex` 是一套給教學影片、課程錄影、螢幕錄製
教材使用的字幕製作流程。核心目標是：先自動產生草稿字幕，再讓使用者一邊
看影片一邊修正錯字、專有名詞與斷句，最後輸出可編輯字幕檔或燒字幕影片。

### 第一次使用需要安裝

必要工具：

- `Node.js 20+`：啟動本機字幕編輯器
- `Git`：下載與更新專案
- 瀏覽器：開啟字幕編輯頁面

選用工具：

- `FFmpeg`：燒字幕、轉檔、檢查影片資訊
- `Python 3.10+`：安裝本機語音辨識工具時使用
- `Whisper` 或其他 ASR 工具：自動轉錄影片並產生 SRT

### 使用步驟

下載專案：

```bash
git clone https://github.com/twyderek/claude.subtitle-review-loop.git
cd claude.subtitle-review-loop
```

安裝並自動開啟字幕編輯器：

```bash
npm install
npm run open
```

手動開啟網址：

```text
http://127.0.0.1:8787/src/subtitle-editor.html
```

建議將影片與字幕放在：

```text
workspace/media.mp4
workspace/media.rule-cleaned.srt
```

### 兩階段字幕流程

第一階段：收到影片時

- 請使用者提供專有名詞、講者姓名、課程名稱、平台名稱等對照資料
- 請使用者提供字幕清理規則檔
- 若沒有規則檔，只做格式檢查，不自行套用固定清理規則

第二階段：輸出前

- 先產生可檢查的字幕修正版與修正報告
- 讓使用者確認錯字、專有名詞與斷句
- 先輸出短樣片確認字幕大小與位置
- 確認無誤後，再輸出正式 SRT 或燒字幕 MP4

### Windows 注意事項

- PowerShell 可能把正確的 UTF-8 繁中文字顯示成亂碼，請用 Python 驗證檔案內容。
- Whisper 在 Windows 可能因 `cp950` 輸出錯誤中斷，請設定 `PYTHONIOENCODING=utf-8` 與 `PYTHONUTF8=1`。
- 不建議在 PowerShell 使用 Bash heredoc，例如 `python - <<'PY'`；請改成把 Python 腳本寫成 `.py` 檔再執行。

### 本機字幕編輯器

啟動伺服器後，使用者可以在瀏覽器中：

- 載入影片與 SRT
- 第一階段點選字幕跳到對應時間並校稿
- 搜尋字幕文字
- 修改錯字、斷句與專有名詞
- 第二階段設定燒錄字幕的字型、大小、位置、顏色與外框
- 即時預覽字幕在影片上的顯示效果
- 儲存校稿包到 `workspace/review-output/`

校稿包會包含：

- `media.edited.srt`：修正後字幕檔
- `burn-settings.json`：燒錄字幕設定
- `burn-settings.ffmpeg-style.txt`：FFmpeg `force_style` 參考
- `export-manifest.json`：輸出摘要

### 燒字幕安全預設

教學平台錄影通常畫面資訊很多，字幕不應遮擋主要 UI。建議使用：

- `FontSize=14`
- `Outline=1`
- `Alignment=2`
- `MarginV=22`

或直接使用：

```bash
npm run sample:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled_sample_20s.mp4 --settings workspace/review-output/burn-settings.json
```

確認短樣片沒有遮住畫面重點後，再輸出完整影片：

```bash
npm run burn:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled.mp4 --settings workspace/review-output/burn-settings.json
```

### 檔案安全提醒

請不要把原始影片、學生資料、課程逐字稿、實際字幕或燒字幕影片提交到
GitHub。專案已透過 `.gitignore` 排除常見媒體檔與字幕輸出，但上傳前仍建議
先檢查 `git status`。

## Local Files To Ignore

The `.gitignore` excludes generated media, subtitle outputs, and local workspace
files by default. This keeps private video material out of GitHub.
