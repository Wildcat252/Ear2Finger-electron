# Ear2Finger

Turn any YouTube video — or any block of text — into an **English listening and dictation exercise**. You hear a sentence, you type it word by word, and the app keeps track of every word that gave you trouble.

Everything runs locally: a FastAPI backend, a SQLite database, and your own audio files on your own disk. An optional **AI coach** reads your practice history and tells you what to work on next.

Ships three ways from the same codebase:

| | How to run it | Good for |
|---|---|---|
| **Desktop app** | `npm run electron:dev`, or an installer from `npm run electron:pack` | Everyday use — no Python required for end users |
| **Web app** | `npm run web:dev` (or `./run-web.sh`) | Same backend and database, in your browser |
| **Backend only** | `uvicorn main:app --reload` | API work, `/docs`, integrations |

---

## Demo videos

[Import a YouTube lesson](https://youtu.be/TEuXrHZ0VSE) · [Dictation practice](https://youtu.be/5z7yxVxZC1I)

<div align="center">
  <a href="https://youtu.be/TEuXrHZ0VSE">
    <img src="https://img.youtube.com/vi/TEuXrHZ0VSE/hqdefault.jpg" alt="Import a YouTube lesson into Ear2Finger" width="1080"/>
  </a>
  <p><strong><a href="https://youtu.be/TEuXrHZ0VSE">📺 Import a YouTube lesson</a></strong></p>
</div>

<div align="center">
  <a href="https://youtu.be/5z7yxVxZC1I">
    <img src="https://img.youtube.com/vi/5z7yxVxZC1I/hqdefault.jpg" alt="Dictation practice in Ear2Finger" width="1080"/>
  </a>
  <p><strong><a href="https://youtu.be/5z7yxVxZC1I">📺 Dictation practice</a></strong></p>
</div>

*(Inline previews work in most Markdown viewers. On github.com the raw HTML may be stripped — use the links above.)*

---

## Quick start

**macOS, no terminal:** double-click **`Start.command`** the first time (it creates the backend virtualenv and installs all dependencies), then **`Run.command`** for every launch after that. **`Web.command`** opens the browser version instead of the desktop window.

**Everywhere else:**

```bash
# 1. Backend deps
python -m venv backend/venv
source backend/venv/bin/activate       # Windows: backend\venv\Scripts\activate
pip install -r backend/requirements.txt

# 2. Frontend + Electron deps
npm install
npm install --prefix frontend

# 3. Run — desktop window, or `npm run web:dev` for the browser
npm run electron:dev
```

Both dev modes start Uvicorn on port **8000** and Vite on port **3000**.

**Prerequisites:** Python 3.8+, Node.js 18+, and **FFmpeg** for MP3 extraction (`brew install ffmpeg`, `sudo apt-get install ffmpeg`, or the [FFmpeg site](https://ffmpeg.org/download.html) on Windows).

---

## How you use it

### 1. Import a lesson

Paste a **YouTube URL** and the backend pulls the video's subtitles with `yt-dlp` (manual or auto-generated), parses the WebVTT, segments it into sentences with NLTK, downloads an audio-only MP3 with FFmpeg, and stores every sentence with its start/end timestamps.

Or paste **plain text**. Text lessons get no audio file — they are read aloud by the browser's own speech synthesis instead (`text://` lessons, see [Speech](#speech-for-text-lessons)).

Lessons can be grouped into **playlists**, and each lesson keeps its own session history.

### 2. Practice in the workspace

You get one sentence at a time with a per-word input row. Type what you hear; each word is checked as you go, hints reveal a word when you're stuck, and every keystroke's correctness feeds the stats.

**Word-by-word mode** plays one word at a time instead of the whole sentence, with a configurable gap between words and per-group repetition — punctuation is spoken separately ("Hello" · pause · "comma") so you learn to type it too.

Default shortcuts (all rebindable in **Settings → Keyboard shortcuts**):

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `Enter` | Play / pause | | `` ` `` | Translate sentence |
| `[` `]` | Previous / next sentence | | `-` `=` | Slower / faster |
| `\` | Replay sentence | | `Meta` | Toggle word-by-word |
| `/` | Skip word | | `'` | Previous word |

### 3. Drill your tricky words

The **Practice** tab collects the words that actually gave you trouble. A word is "tricky" only when **both** signals are present:

- its **most recent attempt needed 3 or more tries**, *and*
- it needed **at least one hint**

Requiring both keeps the list short and worth working through — a single slip or a single hint isn't enough to land on it. From there you can drill a word, **bin** it (hidden but recoverable), delete it once learnt, or add your own custom words.

### 4. Check the dashboard

Totals, error rates over time, per-word difficulty, hint usage, and word/sentence length distributions — plus the AI coach's summary if you've enabled it.

---

## The AI coach (optional)

A personalized learning agent that reads your own practice history and:

- **Summarizes your progress** from per-word spelling difficulty, hint usage, and error rates over time.
- **Generates tailored advice** — 3–5 concrete, numbered things to practice next.
- **Recommends sentences to review** by using Qdrant to find sentences containing your weakest words.
- **Translates** the current sentence on demand.

It uses only your own stats and sentences; embeddings live in your own Qdrant instance.

**Where it shows up:** an *AI Language Coach* card and a full-screen modal on the **Dashboard**; a side panel in the **Workspace** that opens when you finish a lesson; and an **"Ask coach"** button on each past session in **Lesson history**.

**To enable it you need:**

1. A reachable **Qdrant** — embedded local path (the default for the desktop app), a local server, or Qdrant Cloud.
2. A **Gemini API key**, saved per user in **Settings → AI API-key**. The same key powers both chat and embeddings.
3. Enough practice history for stats and vectors to exist.

**Model and vector config** (optional, `backend/.env`): `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` (default `models/embedding-001`), `QDRANT_URL`, `QDRANT_VECTOR_SIZE`.

> ⚠️ `QDRANT_VECTOR_SIZE` must match the embedding dimension — **768** for `models/embedding-001`. If you previously used the local 384-dim model, recreate or clear the Qdrant collections before re-ingesting.

---

## Speech for text lessons

Text lessons are read aloud with the browser's **Web Speech API**, so the available voices come from your OS and browser. Pick one under **Settings → Audio → Dictation voice**; the app prefers "(Premium)" / "(Enhanced)" voices where they exist, then any English voice.

Chrome-specific things worth knowing:

- Chrome will not speak until the page has received a **user gesture** — click anywhere before pressing play.
- The "Google …" voices are **network** voices and need internet. The "(Premium)" ones are local.
- If nothing is audible, check the tab isn't muted and that the site may play sound in Chrome's site settings.

Two Chrome quirks are already worked around in the code ([`frontend/src/voices.ts`](frontend/src/voices.ts)): its voice list is empty until `voiceschanged` fires, and it silently stops synthesis about 15 seconds into an utterance unless nudged with `pause()`/`resume()`.

---

## Desktop builds (Electron)

The Electron shell starts a **PyInstaller-bundled** FastAPI backend — end users install no Python — and uses **embedded Qdrant** via `qdrant-client` local storage (`QDRANT_LOCAL_PATH`). All application data (SQLite, Qdrant files, downloads, audio) lives under Electron's per-user `userData` directory.

```bash
npm run electron:dev      # dev: Uvicorn + Vite + Electron against the dev server
npm run electron:pack     # installers/portable builds into release/
```

`electron:pack` runs `electron:build:backend` (PyInstaller freezes `run_electron_backend.py` into `backend/build/pyinstaller-dist/`, onedir), builds the frontend, then runs `electron-builder`. Building installers needs the `backend/venv` from [Quick start](#quick-start) — PyInstaller is installed into it. No separate C toolchain or `patchelf` is needed for a typical wheel-based freeze.

**Linux sandbox:** Chromium's setuid `chrome-sandbox` isn't usable from a normal install, so the dev launcher passes `--no-sandbox`, `main.cjs` sets the same switches at runtime, and `electron:pack` adds `linux.executableArgs` so AppImage/.deb start with it before JS loads. Older AppImages: run as `./Ear2Finger-*.AppImage --no-sandbox`.

**Linux `.deb` installs but nothing opens:** run the binary from a terminal (`dpkg -L ear2finger | grep /bin/`) so stderr is visible. Builds write `startup.log` and `uvicorn.log` under `~/.config/ear2finger/` (plus `qdrant.log` with external Qdrant).

**External Qdrant HTTP server** (legacy/debugging): set `ELECTRON_EXTERNAL_QDRANT=1`, and Electron expects a Qdrant API on `http://127.0.0.1:6333` — from Docker, or from `npm run electron:vendor`, which downloads the [official binary](https://github.com/qdrant/qdrant/releases) into `electron/vendor/qdrant/`.

---

## API

Everything is under `/api`. Interactive docs at `http://localhost:8000/docs` (Swagger) and `/redoc`.

**Health** — `GET /health`

**Lessons**
| | |
|---|---|
| `POST /youtube/process` | Import a YouTube video: subtitles, MP3, segmentation |
| `POST /youtube/process_text` | Import plain text as a lesson |
| `GET /youtube/videos` · `GET /youtube/videos/{id}` | List / fetch lessons |
| `GET /youtube/videos/{id}/sentences` | Sentences with timestamps |
| `GET /youtube/videos/{id}/audio` | Stream/download the MP3 |
| `DELETE /youtube/videos/{id}` | Delete lesson, sentences, and audio |

**Playlists** — `POST|GET /playlists`, `GET|PATCH|DELETE /playlists/{id}`, `GET /playlists/{id}/videos`, `POST|DELETE /playlists/{id}/videos/{video_id}`

**Sessions** — `GET /lessons/{video_id}/sessions`, `POST /user/lesson-sessions`, `PUT /user/lesson-sessions/current`

**Progress and stats**
| | |
|---|---|
| `GET|POST /user/progress` | Raw per-sentence learning events |
| `GET /user/stats` | Aggregated totals, distributions, and top tricky words (latest attempt ≥ 3 tries **and** ≥ 1 hint) |
| `GET /user/practice/words` | Practice word states — custom, binned, deleted |
| `POST /user/practice/words/add` · `/bin` · `/recover` | Manage the practice list |
| `DELETE /user/practice/words/{word}` | Drop a word from the list |

**Settings** — `GET|PUT /user/config`, `GET|POST /user/ai-keys`, `POST /user/ai-keys/{id}/activate`, `DELETE /user/ai-keys/{id}`

**AI coach** — `POST /ai/coach/feedback`, `POST /ai/coach/recommend-practice`, `POST /ai/translate`

**Legacy** — `GET|POST /dictations`, `GET /dictations/{id}`

---

## Architecture

**Backend** — Python 3.8+ · FastAPI · Uvicorn · SQLAlchemy + SQLite · yt-dlp · NLTK · Qdrant · Gemini via LangChain (chat **and** embeddings; no local PyTorch stack)

**Frontend** — React 18 · TypeScript · Vite · Tailwind CSS · Axios

```
Ear2Finger/
├── backend/
│   ├── main.py                     # FastAPI app; routers mounted under /api
│   ├── database.py                 # SQLAlchemy models (see below)
│   ├── config.py                   # Gemini + Qdrant configuration
│   ├── routers/
│   │   ├── youtube.py              # Video and text lesson import
│   │   ├── playlists.py            # Playlist CRUD
│   │   ├── lesson_sessions.py      # Per-lesson practice sessions
│   │   ├── learning_progress.py    # Progress events, stats, tricky words
│   │   ├── ai_coach.py             # Coach feedback, recommendations, translate
│   │   ├── ai_keys.py              # Per-user API keys
│   │   ├── user_config.py          # User settings
│   │   ├── dictation.py            # Legacy
│   │   └── health.py
│   └── services/
│       ├── youtube_processor.py    # yt-dlp, WebVTT parsing, segmentation
│       ├── qdrant_client.py        # Ingestion + semantic search
│       └── ai_client_factory.py    # LLM + embedding clients
│
├── frontend/src/
│   ├── App.tsx                     # Routes; speech keep-alive
│   ├── voices.ts                   # Shared TTS voice loading
│   ├── keybindings.ts              # Rebindable shortcuts
│   ├── api.ts · audio.ts
│   └── components/
│       ├── Workspace.tsx           # Dictation + coach drawer
│       │   └── workspace/          # PlayerPanel, DictationArea, useTtsPlayback…
│       ├── Practice.tsx            # Tricky-word drills
│       │   └── practice/           # WordLists, DrillCard, AddWordsSidebar
│       ├── Dashboard.tsx           # Stats + coach summary
│       ├── Settings.tsx            # Keys, audio, shortcuts, playback
│       ├── LessonHistory.tsx       # Past sessions, "Ask coach"
│       └── ImportModal.tsx · YouTubeProcessor.tsx
│
├── electron/main.cjs               # Desktop shell
├── scripts/                        # Dev orchestration, PyInstaller, Qdrant vendor
├── Start.command · Run.command · Web.command · run-web.sh
└── package.json                    # Electron + electron-builder config
```

**Data model** (`backend/database.py`): `User`, `UserConfig`, `Playlist`, `PlaylistVideo`, `Video`, `Sentence`, `LessonSession`, `LearningProgress`, `PracticeWordState`.

**The practice loop end to end:** you type → per-word correctness, hints, and error characters go to `POST /api/user/progress` → `GET /api/user/stats` aggregates them into per-word difficulty and the tricky list → `qdrant_client.py` ingests learning events and sentence embeddings → the coach reads both to write feedback and pick sentences to review.

---

## Development

**Backend** — routers live in `backend/routers/`; add a file and mount it in `main.py`. The auto-generated `/docs` is the fastest way to poke at an endpoint.

```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend** — Vite with HMR, TypeScript, Tailwind.

```bash
cd frontend && npm run dev          # dev server on :3000
npx tsc --noEmit                    # typecheck
npm run build                       # production build into frontend/dist/
```

For a standalone production backend, run Uvicorn under a process manager (systemd, supervisor, Docker) and serve `frontend/dist/` from any static file server.

---

## Notes

**Lite deployments.** A build without the AI coach, vector search, or external LLM keys uses the **same SQLite schema** as the full app, so databases can be shared or migrated between them.

**License.** See [LICENSE](LICENSE).

**Contributing.** Pull requests welcome.
