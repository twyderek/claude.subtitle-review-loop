# Subtitle Review Loop 專案技術文件

文件版本：1.0  
最後整理：2026-06-29  
Repository：`twyderek/claude.subtitle-review-loop`

> 核心原則：AI 與腳本負責加速初稿與重複工作；人工校稿負責語意、專有名詞與畫面可讀性；所有輸出設定都必須可追溯、可重跑。

## 1. 文件目的

本文件將 Subtitle Review Loop 整理為專案技術文件，說明需求來源、系統邊界、流程設計、功能模組、資料流、輸出格式、品質控管與部署方式。

文件讀者包含專案維護者、課程影片製作人員、字幕校稿人員，以及想把此流程導入其他電腦或其他課程專案的使用者。

## 2. 專案背景與需求分析

教學影片與課程錄影常以 ASR 或 Whisper 產生草稿字幕，但初稿通常不能直接發布。實務上最容易出錯的地方不是 SRT 格式，而是專有名詞、斷句、口語清理、字幕位置與燒錄視覺效果。

本專案採用 human-in-the-loop 設計：先以自動化工具提高效率，再透過瀏覽器校稿與樣片確認建立品質門檻。

| 類別 | 技術需求 |
| --- | --- |
| 字幕校稿 | 影片播放、cue 跳轉、搜尋、直接修改 SRT。 |
| 兩階段流程 | 第一階段校稿文字，第二階段設定燒錄樣式。 |
| 規則管理 | 清理規則由使用者提供，避免跨課程誤套。 |
| 輸出標準 | 產生 edited SRT、burn settings、FFmpeg style 與 manifest。 |
| Windows 友善 | 雙擊啟動、UTF-8 防呆、Node.js 檢查。 |
| 可攜分享 | 建置 ZIP 工具包，其他電腦可解壓後使用。 |

## 3. 系統範圍

本專案負責字幕校稿流程、SRT 清理、燒錄設定、FFmpeg 燒字幕腳本、Windows 啟動檔與可攜 ZIP 工具包。

本專案不內建雲端 ASR，也不把影片或字幕上傳到雲端；可攜工具包只負責校稿與燒錄設定，不直接轉錄或燒錄影片。

## 4. 整體工作流程

流程分為輸入收集、字幕產生或匯入、規則清理、字幕校稿、燒錄預覽、校稿包輸出、樣片確認與正式交付。

每個階段都會留下可檢查的中間成果，避免發生錯誤時必須重做整支影片。

## 5. 功能模組設計

前端工作台由 src/subtitle-editor.html 實作，提供兩階段 UI：第一階段校稿字幕文字，第二階段設定與預覽燒錄字幕樣式。

本機服務由 src/subtitle-editor-server.mjs 實作，支援靜態檔案、MP4 Range Request，以及 POST /api/save-review-package 儲存校稿包。

燒字幕腳本由 scripts/burn-subtitles.mjs 實作，讀取 burn-settings.json 並轉成 FFmpeg force_style。

可攜工具包由 scripts/build-portable-toolkit.mjs 建置，產生 input、output、啟動檔與使用說明。

| 檔案 | 模組 | 職責 |
| --- | --- | --- |
| src/subtitle-editor.html | 兩階段字幕校稿網頁 | 影片同步、SRT 解析、cue 編輯、字幕樣式預覽與校稿包儲存。 |
| src/subtitle-editor-server.mjs | 本機 HTTP 服務 | 靜態檔案、MP4 Range Request、POST /api/save-review-package。 |
| src/apply_subtitle_rules.mjs | 字幕清理腳本 | 依使用者提供的 rule file 進行清理與報告輸出。 |
| scripts/burn-subtitles.mjs | FFmpeg 燒字幕腳本 | 讀取 burn-settings.json，轉換 force_style，支援樣片與正式輸出。 |
| scripts/build-portable-toolkit.mjs | 可攜工具包建置 | 產生 input/output、雙擊啟動檔與使用說明。 |

## 6. 資料流與輸出格式

完整專案模式使用 workspace 作為本機素材與輸出位置；可攜工具包模式使用 input 與 output，降低非技術使用者操作門檻。

主要輸出包含 media.edited.srt、burn-settings.json、burn-settings.ffmpeg-style.txt 與 export-manifest.json。

```text
workspace/media.mp4 -> workspace/media.rule-cleaned.srt -> browser review -> workspace/review-output/media.edited.srt -> burn-settings.json -> FFmpeg sample/full output
```

| 檔案 | 說明 | 用途 |
| --- | --- | --- |
| media.edited.srt | 人工修正後字幕 | 主要字幕交付檔 |
| burn-settings.json | 結構化燒錄設定 | 提供腳本讀取 |
| burn-settings.ffmpeg-style.txt | FFmpeg force_style 字串 | 人工檢查或手動 FFmpeg 使用 |
| export-manifest.json | 輸出摘要 | 記錄 cue 數、修改數、警告數與輸出時間 |
| media_subtitled_sample_20s.mp4 | 短樣片 | 確認字幕大小與位置 |
| media_subtitled.mp4 | 完整燒字幕影片 | 最終影片輸出 |

## 7. 品質保證與錯誤修正

品質檢查包含 SRT 解析、空 cue、時間軸重疊、專有名詞、rule file 套用、字幕位置、畫面遮擋、影片解析度與音訊保留。

Runbook 已記錄 Windows UTF-8、PowerShell 亂碼、Whisper cp950、PowerShell heredoc、字幕過大與大型影片處理等問題。

| 問題 | 防呆方式 |
| --- | --- |
| PowerShell 顯示亂碼 | 使用 Python 以 UTF-8 讀檔驗證。 |
| Whisper cp950 錯誤 | 設定 PYTHONIOENCODING=utf-8 與 PYTHONUTF8=1。 |
| PowerShell 不支援 Bash heredoc | 改用 PowerShell here-string 或獨立 .py 檔。 |
| 字幕太大遮住 UI | 先輸出 20 秒樣片，再正式輸出。 |
| 大型影片重複複製 | 同磁碟可使用 Hard Link。 |

## 8. 部署與操作

完整專案可透過 npm run open 啟動；Windows 使用者可雙擊 start-subtitle-editor.cmd。

可攜工具包可透過 npm run build:toolkit 產生。解壓後，使用者將影片放入 input/media.mp4、字幕放入 input/media.srt，再雙擊啟動字幕校對工具.cmd。

## 9. 安全與隱私

workspace 與 dist 預設不提交 GitHub；影片、音訊、字幕與燒錄產物也被 .gitignore 排除。

本機服務只監聽 127.0.0.1。分享工具包時應保持 input/output 為空，不附帶實際課程素材。

## 10. 後續擴充建議

建議新增閱讀速度與字數警示、空 cue/重疊 cue 視覺標示、一鍵產生 FFmpeg 樣片、中英雙語字幕欄位、glossary/typo map 匯入，以及工具包自訂輸出資料夾。
