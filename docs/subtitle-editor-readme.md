# Subtitle Editor

Open the editor at:

```text
http://127.0.0.1:8787/src/subtitle-editor.html
```

Default assets:

- Video: `workspace/media.mp4`
- Subtitle: `workspace/media.rule-cleaned.srt`

Start the local server:

```powershell
npm run start
```

Start the local server and open the editor automatically:

```powershell
npm run open
```

On Windows, you can also double-click:

```text
start-subtitle-editor.cmd
```

Use stage 1 to:

- watch the video while editing subtitle cues
- jump to any cue time
- search subtitle text
- apply the subtitle cleanup rules
- download or save an edited SRT

Chrome and Edge support direct saving through `Save SRT`. Other browsers can
use `Download SRT`.

Use stage 2 to:

- preview burned subtitles over the video
- set font family, font size, font color, outline color, outline width,
  subtitle position, vertical margin, and bold style
- save the review package to `workspace/review-output/`

The saved review package includes:

- `media.edited.srt`
- `burn-settings.json`
- `burn-settings.ffmpeg-style.txt`
- `export-manifest.json`

After saving the review package, render a short subtitle sample before creating
the full burned-subtitle video:

```powershell
npm run sample:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled_sample_20s.mp4 --settings workspace/review-output/burn-settings.json
```

Only burn the full video after the sample confirms the subtitles are readable
and do not cover important UI content:

```powershell
npm run burn:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled.mp4 --settings workspace/review-output/burn-settings.json
```

Troubleshooting notes are collected in:

```text
docs/RUNBOOK-ISSUES-AND-FIXES.md
```
