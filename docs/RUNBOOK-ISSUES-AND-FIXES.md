# Runbook: Issues And Fixes

This runbook records production issues found while processing long teaching
videos on Windows. Follow it before every new subtitle job.

## 1. Windows Console Encoding Can Look Broken

### Symptom

Traditional Chinese text looks like mojibake in PowerShell output, for example
`¦U¦ì¦Ñ®v`, even when the file is valid UTF-8.

### Fix

Do not judge subtitle encoding from PowerShell display alone. Verify with
Python:

```powershell
$py = "C:\Users\derek\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $py -c "from pathlib import Path; print(Path(r'workspace/media.rule-cleaned.srt').read_text(encoding='utf-8-sig')[:500])"
```

If Python reads the text correctly, the file is fine.

## 2. Whisper Can Crash On Windows CP950 Output

### Symptom

`openai-whisper` transcribes for a while, then fails with:

```text
UnicodeEncodeError: 'cp950' codec can't encode character
```

### Fix

Force UTF-8 Python output and suppress verbose line-by-line transcript output:

```powershell
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
python -m whisper workspace/media.wav --model small --language Chinese --task transcribe --output_format all --output_dir workspace --verbose False
```

Also ensure FFmpeg is on `PATH` before running Whisper.

## 3. Avoid Inline Python Heredocs In PowerShell

### Symptom

Commands like this fail in PowerShell:

```powershell
python - <<'PY'
```

### Fix

Write Python scripts to `.py` files with UTF-8 encoding, then run them:

```powershell
Set-Content -LiteralPath scripts\clean_subtitles.py -Encoding utf8 -Value $script
python scripts\clean_subtitles.py
```

This also avoids accidental `?` replacement in Chinese strings passed through
the shell.

## 4. Subtitle Style Must Be Sampled Before Full Burn

### Symptom

Large centered subtitles cover the teaching platform UI and make the video hard
to watch.

### Fix

Always render a 20-second sample before a full burn:

```powershell
npm run sample:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled_sample_20s.mp4 --settings workspace/review-output/burn-settings.json
```

Manual FFmpeg equivalent for debugging:

```powershell
ffmpeg -y -ss 00:00:10 -t 20 -i workspace/media.mp4 -vf "subtitles='workspace/media.rule-cleaned.srt':charenc=UTF-8:force_style='FontName=Microsoft JhengHei,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=22'" -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart workspace/media_subtitled_sample_20s.mp4
```

For screen-recorded teaching videos, use the safe default:

- `FontSize=14`
- `Outline=1`
- `Alignment=2`
- `MarginV=22`

Then inspect a screenshot before rendering the full video.

## 5. Prefer The Built-In Burn Script

Use the project script so subtitle style stays consistent:

```powershell
npm run burn:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled.mp4 --settings workspace/review-output/burn-settings.json
```

The script applies the safe teaching-video style and handles Windows path
escaping for FFmpeg.

## 6. Use Hard Links For Large Local Videos

When preparing the browser editor workspace, avoid copying multi-GB videos.
Use a hard link if the source and workspace are on the same drive:

```powershell
New-Item -ItemType HardLink -Path workspace\media.mp4 -Target D:\source.mp4
```

This keeps the review workflow fast and avoids duplicate storage.

## 7. Browser Review Remains Mandatory

Do not burn subtitles immediately after ASR or rule cleanup. The required order
is:

1. Generate draft subtitles.
2. Apply user-provided rules.
3. Produce correction report and terminology table.
4. Review in the browser editor.
5. Export the corrected SRT.
6. Render a sample burned-subtitle clip.
7. Burn the full MP4 only after the sample is visually acceptable.
