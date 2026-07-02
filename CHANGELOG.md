# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

### Changed

### Fixed

---

## [0.3.1] — 2026-07-02

### Added

- YouTube 載入進度條：點擊「載入 YouTube 影片」後即時顯示 5 階段進度（取得影片資訊 → 下載音訊並轉錄 → 清理字幕 → 載入字幕 → 完成），含進度條動畫與階段描述文字
- 進度條 CSS 樣式（`.youtube-progress`、`.progress-bar`、`.progress-fill`）
- 進度條控制函式：`updateProgressBar()`、`setProgressPhase()`、`clearProgress()`
- `state.ingestProgress` 與 `state.ingestAbortController` 狀態欄位
- `docs/YOUTUBE-LOADING-OPTIMIZATION-README.md` — 完整技術文件

### Changed

- `importYoutubeSubtitles()` 改為平行處理：`showYoutubePreview(url)` 移到 `fetch("/api/youtube-ingest")` 之前，縮圖預覽與伺服器 ingest 同時進行
- `showYoutubePreview()` 重構：iframe 延遲顯示（只有 `onReady` 事件觸發後才加 `.ready` class），縮圖始終優先可見
- CSS z-index 層級重構：poster z-index:3 > iframe z-index:1/2 > burn-overlay z-index:4
- `showLocalVideo()` 與 `resetEditorState()` 增加 `clearProgress()` 呼叫
- `loadInitialProjectFromQuery()` 從 URL 參數載入 YouTube 時顯示進度訊息
- README.md 更新 YouTube 匯入說明（中英雙語）

### Fixed

- YouTube iframe 預覽黑畫面問題：iframe 不再在 API 載入前顯示，縮圖始終可見
- CSS 衝突：移除 `.loaded` class 邏輯，改用 `.ready` class 控制 iframe 顯示
- 縮圖 z-index 被 iframe 遮擋問題

---

## [0.3.0] — 2026-07-02

### Added

- YouTube 影片匯入功能：支援從 YouTube URL 自動下載字幕或音訊轉錄
- `scripts/youtube-ingest.mjs`：yt-dlp + Whisper 整合腳本
- `src/subtitle-editor-server.mjs`：`/api/youtube-ingest` POST endpoint
- `scripts/burn-subtitles.mjs`：FFmpeg 燒字幕腳本（含 sample 模式）
- `scripts/build-portable-toolkit.mjs`：便攜工具包打包腳本
- `start-subtitle-editor.cmd`：Windows 一鍵啟動腳本
- `workspace/review-output/`：校稿包輸出目錄
- `export-manifest.json`：輸出摘要檔案
- `burn-settings.json`：燒錄設定 JSON
- `burn-settings.ffmpeg-style.txt`：FFmpeg force_style 參考
- `media.edited.srt`：修正後字幕檔
- 繁體中文使用說明（README 第 326 行起）
- 專案技術文件（docs/PROJECT-TECHNICAL-DOCUMENT-ZH.md）
- 工作流程圖（docs/subtitle-review-loop-workflow.excalidraw）
- 可重複使用的 Loop Prompt（docs/VIDEO-FACTORY-LOOP-PROMPT.md）
- Runbook 問題與修復記錄（docs/RUNBOOK-ISSUES-AND-FIXES.md）
- 編輯器說明（docs/subtitle-editor-readme.md）

### Changed

- 伺服器監聽地址改為 `127.0.0.1:8787`（僅本機存取）
- 字幕清理規則改為使用者自訂，不再硬編碼
- `npm install` 自動執行 setup check
- `npm run open` 自動啟動伺服器並開啟瀏覽器

### Fixed

- Windows cp950 編碼問題：Whisper 指令加入 `PYTHONUTF8=1` 與 `PYTHONIOENCODING=utf-8`
- FFmpeg 路徑轉義問題

---

## [0.2.0] — 2026-05-10

### Added

- 初始專案結構
- 字幕編輯器 HTML（`src/subtitle-editor.html`）
- 本機伺服器（`src/subtitle-editor-server.mjs`）
- SRT 解析與編輯功能
- 字幕清理規則腳本（`src/apply_subtitle_rules.mjs`）
- Git 版本控制與 `.gitignore`
- Obsidian 關聯筆記

---

## [0.1.0] — 2026-05-01

### Added

- 專案概念驗證與原型設計
- 基本工作流規劃

---

## 版本說明

- **主版本**：不兼容的 API 或工作流變更
- **次版本**：新功能（向後兼容）
- **修訂版本**：bug 修復（向後兼容）

## 貢獻指南

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add: amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 授權

本專案為私有專案，所有權利保留。

[Unreleased]: https://github.com/twyderek/claude.subtitle-review-loop/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/twyderek/claude.subtitle-review-loop/releases/tag/v0.3.1
[0.3.0]: https://github.com/twyderek/claude.subtitle-review-loop/releases/tag/v0.3.0
[0.2.0]: https://github.com/twyderek/claude.subtitle-review-loop/releases/tag/v0.2.0
[0.1.0]: https://github.com/twyderek/claude.subtitle-review-loop/releases/tag/v0.1.0
