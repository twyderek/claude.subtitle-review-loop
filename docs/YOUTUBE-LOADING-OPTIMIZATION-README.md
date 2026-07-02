# YouTube 載入優化 — 工作摘要與紀錄

> 建立時間：2026-07-02  
> 適用版本：v0.3.1（即將發布）  
> 修改檔案：`src/subtitle-editor.html`

---

## 問題描述

校稿網頁在使用「載入 YouTube 影片」功能時，影片預覽區域顯示一片漆黑，使用者看不到任何視覺回饋。

### 使用者困擾

1. 點擊「載入 YouTube 影片」後，畫面完全黑屏，不知道發生了什麼事
2. 伺服器端 ingest 需要 1-5 分鐘（yt-dlp 下載 + Whisper 轉錄），這段期間黑屏
3. 無法判斷影片是否載入成功，也不知道還需要等多久

---

## 根本原因分析

### 原因 1：CSS z-index 層級錯誤

原始 CSS 中 `.youtube-frame` 沒有明確 z-index，`.youtube-poster` 的 z-index 是 1。iframe 在 DOM 中即使背景透明，仍是覆蓋在 poster 上方的元素，導致縮圖被遮住。

### 原因 2：iframe 過早顯示

原始程式碼在 `showYoutubePreview()` 中，只要進入 youtube-mode 就會顯示 iframe。但此時 YouTube API 尚未載入、YT.Player 尚未建立，iframe 只是空的黑色區塊。

### 原因 3：伺服器端 ingest 阻塞了預覽

原始 `importYoutubeSubtitles()` 函式中，`showYoutubePreview(url)` 在 `await fetch("/api/youtube-ingest")` **之後**才呼叫。伺服器處理期間使用者看到的是黑畫面。

---

## 實施的修復

### 修復 1：CSS 層級重構

| 元素 | 舊 z-index | 新 z-index | 說明 |
|------|-----------|-----------|------|
| `.youtube-frame` | 未設定 | 1（預設最低） | 只有在 `.ready` 時才顯示 |
| `.youtube-poster` | 1 | 3（最高） | 確保縮圖始終可見 |
| `.burn-overlay` | 2 | 4 | 字幕校對覆蓋層 |

- iframe 只有在加上 `.ready` class 後才顯示（`display: block`）
- poster 只有在加上 `.hidden` class 後才隱藏
- 移除原有的 `.loaded` class 邏輯（從未真正生效）

### 修復 2：iframe 延遲顯示

- 移除 `.video-shell.youtube-mode .youtube-frame { display: block; }` 規則
- 新增 `.video-shell.youtube-mode .youtube-frame.ready { display: block; z-index: 2; }` 規則
- 只有在 `YT.Player` 的 `onReady` 事件中才加上 `.ready` class
- 縮圖在 iframe 準備好後 800ms 自動隱藏

### 修復 3：立即顯示縮圖

- 在 `showYoutubePreview()` 中，設定 `el.youtubePoster.src` 為 YouTube 縮圖 URL
- 縮圖使用 `hqdefault.jpg`（高畫質，480x360px）
- 縮圖載入完成後自動觸發 API 預載

### 修復 4：平行處理

- `importYoutubeSubtitles()` 中，`showYoutubePreview(url)` 移到 `fetch("/api/youtube-ingest")` **之前**
- 縮圖預覽與伺服器端 ingest 平行進行
- 使用者在等待伺服器處理的同時可以看到縮圖

### 修復 5：縮圖點擊 fallback

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

---

## 新增功能：YouTube 載入進度條

### 功能說明

在「貼上 YouTube 影片網址」輸入框下方新增進度條，即時顯示載入進度：

```
┌──────────────────────────────────────────────┐
│ 貼上 YouTube 影片網址              [載入]    │
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░ 30%│
│ 正在下載音訊並轉錄字幕...                     │
└──────────────────────────────────────────────┘
```

### 進度階段

| 階段 | 顯示文字 | 觸發時機 |
|------|---------|---------|
| 1/5 | 正在取得影片資訊... | 點擊「載入 YouTube 影片」瞬間 |
| 2/5 | 正在下載音訊並轉錄字幕... | 伺服器端 yt-dlp + Whisper 處理中 |
| 3/5 | 正在清理字幕內容... | Whisper 完成，套用清理規則 |
| 4/5 | 正在載入字幕... | 字幕下載中 |
| 5/5 | 載入完成！ | 全部完成，1.5 秒後自動消失 |

### 設計特色

- 深色主題：與現有 UI 一致（`#111a2f` 背景，`#68d8ff` 進度條）
- 平滑過渡：進度條寬度變化有 0.3s ease 動畫
- 錯誤處理：載入失敗時顯示錯誤訊息前 60 字
- 自動消失：完成後 1.5 秒自動隱藏，不佔空間
- 縮圖同步：進度條顯示的同時，影片預覽區也同步顯示縮圖

---

## 預期效果

1. 使用者點擊「載入 YouTube 影片」後，**瞬間看到影片縮圖**（而非黑畫面）
2. 縮圖上有 "▶ 點擊在 YouTube 開啟" 提示文字（hover 時顯示）
3. 背景顯示 "⏳ YouTube 播放器載入中..."（loading 狀態）
4. YouTube iframe 載入完成後，縮圖自動淡出（800ms 延遲）
5. 如果 iframe 載入超過 5 秒，狀態列顯示提示訊息
6. 縮圖載入完成後，使用者仍可點擊縮圖直接觀看 YouTube 原始影片
7. 進度條即時顯示 ingest 的 5 階段進度

---

## 修改的檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `src/subtitle-editor.html` | 修改 | CSS 層級重構、進度條、平行處理 |
| `README.md` | 修改 | 更新 YouTube 匯入說明（中英雙語） |
| `CHANGELOG.md` | 新增 | 版本變更紀錄 |
| `docs/YOUTUBE-IFRAME-OPTIMIZATION-SUMMARY.md` | 新增 | 技術詳細摘要 |

---

## 測試步驟

### 基本測試

1. 啟動校稿網頁伺服器（`npm start` 或 `npm run open`）
2. 貼上一個 YouTube 網址到輸入框
3. 點擊「載入 YouTube 影片」
4. 確認：
   - [ ] 瞬間看到影片縮圖（而非黑畫面）
   - [ ] 縮圖上有 "▶ 點擊在 YouTube 開啟" 提示
   - [ ] 縮圖顯示 loading 狀態
   - [ ] 5 秒後狀態列顯示「YouTube 預覽仍在載入中，縮圖已顯示」
   - [ ] iframe 載入完成後縮圖自動隱藏
   - [ ] 點擊縮圖可開啟 YouTube 原始影片
   - [ ] 進度條出現並逐步推進（5 階段）
   - [ ] 完成後 1.5 秒進度條自動消失

### 錯誤場景測試

1. 貼上無效的 YouTube 網址
2. 確認狀態列顯示「無法解析 YouTube 影片 ID」
3. 貼上私密影片的網址
4. 確認縮圖顯示預設圖（YouTube 預設縮圖）
5. 確認進度條顯示錯誤訊息

---

## 已知限制

- 縮圖來自 `i.ytimg.com`，需要外部網路連線
- 部分影片可能沒有公開縮圖（私密/未公開影片）
- iframe 載入時間取決於網路速度和 YouTube 伺服器回應
- Whisper 轉錄時間取決於影片長度（長片可能數分鐘）

---

## 技術細節

### CSS 層級架構

```
z-index: 4  .burn-overlay       （字幕校對覆蓋層）
z-index: 3  .youtube-poster     （縮圖，預設最高）
z-index: 2  .youtube-frame.ready（iframe，準備好後才顯示）
z-index: 1  .youtube-frame      （iframe，預設最低）
```

### 狀態轉換流程

```
使用者點擊「載入 YouTube 影片」
  ↓
showYoutubePreview(url) 立即執行
  ↓
顯示縮圖（el.youtubePoster.src = hqdefault.jpg）
  ↓
確保 youtube-api 已載入
  ↓
建立 YT.Player
  ↓
onReady 事件觸發
  ↓
el.youtubeFrame.classList.add("ready")  ← iframe 才顯示
  ↓
800ms 後 el.youtubePoster.classList.add("hidden")  ← 縮圖隱藏
```

### 平行處理架構

```
importYoutubeSubtitles()
  ├─ showYoutubePreview(url)          ← 前端：立即顯示縮圖
  └─ fetch("/api/youtube-ingest")     ← 後端：平行處理
       ├─ yt-dlp 下載影片資訊
       ├─ yt-dlp 下載音訊
       ├─ Whisper 轉錄
       ├─ apply_subtitle_rules
       └─ 回傳結果
```

---

## 備份

- `src/subtitle-editor.html.bak`（原始版本）

---

## 未來改進方向

1. 進度條可考慮加入取消按鈕（`AbortController`）
2. 縮圖可加入模糊載入效果（blur-up）提升體驗
3. 可考慮加入 WebSocket 即時進度推送（取代輪詢）
4. 可考慮加入多影片批量匯入功能

---

*本文檔由 Claude Code 建立，最後更新：2026-07-02*
