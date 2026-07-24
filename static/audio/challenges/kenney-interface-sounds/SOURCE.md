# Kenney Interface Sounds

- Asset: Interface Sounds 1.0 by Kenney
- Official page: https://kenney.nl/assets/interface-sounds
- License: Creative Commons Zero (CC0 1.0)
- Original archive: `kenney_interface-sounds.zip`
- Download URL: https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip
- Original archive SHA-256: `f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232`

The challenge experience uses these original OGG files:

- `select_001.ogg` — answer or option selection
- `confirmation_001.ogg` — correct answer
- `error_004.ogg` — retry / incorrect answer
- `open_001.ogg` — reveal or stage transition
- `confirmation_002.ogg` — challenge completion

The matching MP3 files are local compatibility fallbacks, transcoded from the original OGG files with FFmpeg 5.1.9 and `libmp3lame -q:a 5`. The app prefers OGG when the browser reports Vorbis support and otherwise selects MP3.

## Question Constellation cue

`qc_bank_001.ogg` and `qc_bank_001.mp3` are original Question Constellation assets,
synthesized locally as a quiet two-note settling cue. They are used only when a short
review is complete so the longer Kenney completion cue remains reserved for the full
challenge.
