# YouTube iframe 載入優化工作摘要

## 問題描述
校稿網頁（subtitle-editor.html）在使用「載入 YouTube 影片」功能時，影片預覽區域顯示一片漆黑，使用者看不到任何視覺回饋，必須等待 YouTube IFrame API 載入完成後才會顯示影片。這導致：
1. 使用者點擊「載入 YouTube 影片」後，畫面完全黑屏，不知道發生了什麼事
2. 如果伺服器端 youtube-ingest 需要較長時間（Whisper 轉錄可能數分鐘），黑屏時間更長
3. 無法判斷影片是否載入成功

## 根本原因分析

### 原因 1：CSS z-index 層級錯誤
原始 CSS 中 `.youtube-frame` 沒有明確 z-index，而 `.youtube-poster` 的 z-index 是 1。iframe 在 DOM 中雖然背景透明，但仍然是覆蓋在 poster 上方的元素，導致縮圖被遮住。

### 原因 2：iframe 過早顯示
原始程式碼在 `showYoutubePreview()` 中，只要進入 youtube-mode 就會顯示 iframe（CSS 規則 `.video-shell.youtube-mode .youtube-frame { display: block; }`）。但此時 YouTube API 尚未載入，YT.Player 尚未建立，iframe 只是空的黑色區塊。

### 原因 3：伺服器端 ingest 阻塞了預覽
原始 `importYoutubeSubtitles()` 函式中，`showYoutubePreview(url)` 在 `await fetch("/api/youtube-ingest")` **之後**才呼叫。如果伺服器端需要下載音訊 + Whisper 轉錄，這段期間使用者看到的是黑畫面。

## 實施的修復

### 修復 1：CSS 層級重構
- `.youtube-frame` z-index: 1（預設最低）
- `.youtube-poster` z-index: 3（最高，確保可見）
- `.burn-overlay` z-index: 4（字幕校對覆蓋層）
- iframe 只有在加上 `.ready` class 後才顯示（`display: block`）
- poster 只有在加上 `.hidden` class 後才隱藏

### 修復 2：iframe 延遲顯示
- 移除 `.video-shell.youtube-mode .youtube-frame { display: block; }` 規則
- 新增 `.video-shell.youtube-mode .youtube-frame.ready { display: block; z-index: 2; }` 規則
- 只有在 `YT.Player` 的 `onReady` 事件中才加上 `.ready` class
- 這樣在 iframe 準備好之前，poster 始終可見

### 修復 3：立即顯示縮圖
- 在 `showYoutubePreview()` 中，設定 `el.youtubePoster.src` 為 YouTube 縮圖 URL
- 縮圖使用 `hqdefault.jpg`（高畫質縮圖，480x360px）
- 縮圖載入完成後自動觸發 API 預載

### 修復 4：平行處理
- `importYoutubeSubtitles()` 中，`showYoutubePreview(url)` 移到 `fetch("/api/youtube-ingest")` **之前**
- 縮圖預覽與伺服器端 ingest 平行進行
- 使用者在等待伺服器處理的同時可以看到縮圖

### 修復 5：縮圖點擊fallback
- 縮圖加上 `cursor: pointer` 和 hover 效果
- 點擊縮圖可直接在 YouTube 新分頁開啟影片（`window.open`）
- 如果 iframe 一直載入失敗，使用者仍有其他方式觀看影片

### 修復 6：API 載入優化
- 改用 `youtube-nocookie.com/iframe_api` 載入 API（減少追蹤腳本干擾）
- 新增 `dns-prefetch` 和 `preconnect` 標籤
- 頁面載入時預先載入 API（400ms 內），不等 idle callback

### 修復 7：loading 狀態
- 縮圖加上 `.loading` class，在 YT.Player 建立期間顯示
- loading 狀態下 `pointer-events: none`，讓點擊穿透到 iframe
- 載入完成後移除 loading class

## 預期效果
1. 使用者點擊「載入 YouTube 影片」後，**瞬間看到影片縮圖**（而非黑畫面）
2. 縮圖上方有 "▶ 點擊在 YouTube 開啟" 提示文字
3. 背景顯示 "⏳ YouTube 播放器載入中..."
4. YouTube iframe 載入完成後，縮圖自動淡出（800ms 延遲）
5. 如果 iframe 載入超過 5 秒，狀態列顯示提示訊息
6. 縮圖載入完成後，使用者仍可點擊縮圖直接觀看 YouTube 原始影片

## 修改的檔案
- `D:\claude\claude.subtitle-review-loop\src\subtitle-editor.html`

## 備份
- `D:\claude\claude.subtitle-review-loop\src\subtitle-editor.html.bak`（原始版本）

## 測試步驟
1. 啟動校稿網頁伺服器（`npm start` 或 `node scripts/start-editor.mjs`）
2. 貼上一個 YouTube 網址到輸入框
3. 點擊「載入 YouTube 影片」
4. 確認：
   - [ ] 瞬間看到影片縮圖（而非黑畫面）
   - [ ] 縮圖上有 "▶ 點擊在 YouTube 開啟" 提示
   - [ ] 縮圖顯示 loading 狀態
   - [ ] 5 秒後狀態列顯示「YouTube 預覽仍在載入中，縮圖已顯示】
   - [ ] iframe 載入完成後縮圖自動隱藏
   - [ ] 點擊縮圖可開啟 YouTube 原始影片

## 已知限制
- 縮圖來自 `i.ytimg.com`，需要外部網路連線
- 部分影片可能沒有公開縮圖（私密/未公開影片）
- iframe 載入時間取決於網路速度和 YouTube 伺服器回應

---
建立時間：2026-07-02
優化者：Claude Code
