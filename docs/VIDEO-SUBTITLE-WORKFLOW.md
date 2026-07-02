# Video Subtitle Workflow

This workflow produces accurate editable subtitles and, when approved, a
burned-subtitle video.

## Goal

For every video, produce:

- a draft SRT from transcription or an existing subtitle source
- a correction review pass for typos and terminology
- a rule-cleaned editable SRT
- an optional burned-subtitle MP4
- a browser editor for final human review

## Stage 1 - Collect Reference Material

When a user provides a video, ask for reference material before final subtitle
cleanup. Useful references include:

- course slides or lesson notes
- proper nouns and speaker names
- product names and platform names
- technical acronyms
- glossary entries
- known ASR typo pairs
- previous approved subtitles
- institutional or brand terminology

If the user has no reference material, continue with best effort and clearly
mark the output as needing human terminology review.

## Stage 2 - Transcribe Or Locate Existing Subtitles

Preferred order:

1. Reuse an existing subtitle file only when the source video is verified by
   hash, duration, or package context.
2. For YouTube URLs, reuse existing YouTube captions when they are available
   and the user has the rights to process the video.
3. Use ASR transcription when no trusted subtitle exists.
4. Keep the original transcript or subtitle as `media.srt`.

Never silently mix subtitles from a different video.

For YouTube URL input, use:

```powershell
npm run youtube:ingest -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --rule workspace/rule.txt
```

The import script creates a dedicated folder such as:

```text
workspace/youtube-VIDEO_ID-title-YYYYMMDD-HHMMSS/
```

The browser editor can also call the same workflow through its YouTube URL
input field. The generated `rule-cleaned.srt` is loaded into the editor when
the import finishes.

For local video files, the source file does not need to be named `media.mp4`.
Use:

```powershell
npm run local:ingest -- --video "D:\path\to\source-video.mp4" --rule workspace\rule.txt
```

The local import workflow creates a dedicated folder such as:

```text
workspace/local-source-video-YYYYMMDD-HHMMSS/
```

Command-line imports open the editor automatically with the current run loaded
unless `--no-open` is provided. Directly opening the editor service starts with
an empty project state and never auto-loads previous project files.

On Windows, protect Whisper transcription from console encoding failures:

```powershell
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
whisper workspace/media.mp4 --model small --language Chinese --task transcribe --output_format all --output_dir workspace --verbose False
```

If Chinese text appears as mojibake in PowerShell, verify the file with Python
before assuming the subtitle is corrupted.

## Stage 3 - Generate Correction Review

Before final export, create review artifacts:

- draft subtitle file
- correction review report
- approved correction template

The review should focus on:

- wrong characters
- ASR hallucinations
- missing or incorrect proper nouns
- terminology normalization
- punctuation and reading speed
- empty subtitle cues
- cue timing overlaps

Final export should wait until the correction review is checked.

## Stage 4 - Apply User-Provided Subtitle Rules

Subtitle cleanup rules are project-specific and must come from the user.

For each project, place the active rule file at:

```text
workspace/rule.txt
```

For a new project, ask the user to upload or provide a rule file before applying
stylistic subtitle cleanup. If no rule file is provided, do not invent default
rules. Only perform neutral mechanical checks:

- SRT parsing
- empty subtitle cues
- overlapping timecodes
- unreadable cue length
- obvious encoding corruption

When a rule file is provided, save it beside the generated subtitle outputs so
the cleanup pass is reproducible.

The generated rule-cleaned subtitle is:

```text
workspace/media.rule-cleaned.srt
```

The cleanup report is:

```text
workspace/media.rule-cleaned-report.md
```

## Stage 5 - Human Review In Browser

Launch the local editor:

```powershell
npm run start
```

Open:

```text
http://127.0.0.1:8787/src/subtitle-editor.html
```

Use stage 1 of the editor to:

- watch the video beside the subtitle list
- jump to cue times
- edit typos and terminology
- search subtitle text
- apply subtitle rules
- download or save the revised SRT

Use stage 2 of the editor to:

- preview burned subtitles directly over the video
- configure font family, font size, color, outline, position, and vertical margin
- save the reviewed subtitle and burn settings to `workspace/review-output/`

The review package contains:

- `workspace/review-output/media.edited.srt`
- `workspace/review-output/burn-settings.json`
- `workspace/review-output/burn-settings.ffmpeg-style.txt`
- `workspace/review-output/export-manifest.json`

## Stage 6 - Final Output

After review is complete, produce either:

- final editable SRT only
- burned-subtitle MP4 only
- both SRT and burned-subtitle MP4

For burned subtitles, apply subtitles last in the ffmpeg filter chain.
Always render a short sample clip and screenshot before burning the full video.
This prevents oversized subtitles from covering screen-recorded teaching UI.

Preferred sample command:

```powershell
npm run sample:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled_sample_20s.mp4 --settings workspace/review-output/burn-settings.json
```

Preferred final command after the sample is approved:

```powershell
npm run burn:subtitles -- workspace/media.mp4 workspace/review-output/media.edited.srt workspace/review-output/media_subtitled.mp4 --settings workspace/review-output/burn-settings.json
```

Manual sample command for debugging:

```powershell
ffmpeg -y -ss 00:00:10 -t 20 -i workspace/media.mp4 -vf "subtitles='workspace/media.rule-cleaned.srt':charenc=UTF-8:force_style='FontName=Microsoft JhengHei,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=22'" -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart workspace/media_subtitled_sample_20s.mp4
```

## Verification Checklist

Before delivery, verify:

- SRT parses correctly
- no empty subtitle cues
- no overlapping timecodes
- if a rule file was provided, the subtitle output follows that rule file
- if no rule file was provided, only neutral mechanical checks were applied
- video duration matches source
- video resolution and audio stream are intact
- screenshot sample shows readable subtitles
- subtitle sample does not cover important UI content
- Windows/PowerShell display encoding has not been mistaken for file corruption

Current verified outputs:

- `workspace/media.rule-cleaned.srt`
- `workspace/media_subtitled.mp4`
- `workspace/verify_frame_10s.jpg`
