import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export interface Playlist {
  id: number
  name: string
  created_at: string
  video_count: number
}

export interface Lesson {
  id: number
  video_id: number
  title: string
  duration: number
  sentence_count: number
  is_favorite?: boolean
  audio_file_path?: string
  youtube_url?: string
}

export interface Sentence {
  id: number
  sentence_text: string
  start_time: number
  end_time: number
  sentence_index: number
}

export interface VideoSessionScores {
  correctChars: number
  incorrectChars: number
  hintCount: number
}

interface WorkspaceState {
  playlists: Playlist[]
  selectedPlaylistId: number | null
  selectedLesson: Lesson | null
  lessons: Lesson[]
  sentences: Sentence[]
  sentencesVideoId: number | null
  currentSentenceIndex: number
  isPlaying: boolean
  currentTime: number
  playbackSpeed: number
  pauseInterval: number
  ignorePunctuation: boolean
  ignoreCase: boolean
  repeatCount: number | '∞'
  ttsVoiceName: string
  ttsWordByWord: boolean
  ttsWordInterval: number
  ttsWordsPerGap: number
  wordInputs: string[]
  wordHintIndex: number | null
  wordHintUsed: boolean[]
  wordErrorChars: number[]
  videoSessionScores: VideoSessionScores
}

const defaultScores: VideoSessionScores = {
  correctChars: 0,
  incorrectChars: 0,
  hintCount: 0,
}

const STORAGE_KEY = 'ear2finger-workspace-progress'
// The chosen dictation voice has its own key so it survives even if the
// workspace snapshot below is cleared.
const VOICE_STORAGE_KEY = 'ear2finger-tts-voice'

// Playback & grading preferences get their own key so they persist even if
// the workspace snapshot is cleared.
const DURABLE_STORAGE_KEY = 'ear2finger-playback-settings'

type DurableSettings = {
  pauseInterval: number
  repeatCount: number | '∞'
  ignorePunctuation: boolean
  ignoreCase: boolean
  playbackSpeed: number
  ttsWordByWord: boolean
  ttsWordInterval: number
  ttsWordsPerGap: number
}

function loadDurableSettings(): Partial<DurableSettings> {
  try {
    const raw = localStorage.getItem(DURABLE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<DurableSettings>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadPersistedState(): Partial<WorkspaceState> | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const initialState: WorkspaceState = {
  playlists: [],
  selectedPlaylistId: null,
  selectedLesson: null,
  lessons: [],
  sentences: [],
  sentencesVideoId: null,
  currentSentenceIndex: 0,
  isPlaying: false,
  currentTime: 0,
  playbackSpeed: 1,
  pauseInterval: 3,
  ignorePunctuation: true,
  ignoreCase: true,
  repeatCount: '∞',
  ttsVoiceName: '',
  ttsWordByWord: false,
  ttsWordInterval: 0.5,
  ttsWordsPerGap: 1,
  wordInputs: [],
  wordHintIndex: null,
  wordHintUsed: [],
  wordErrorChars: [],
  videoSessionScores: { ...defaultScores },
}

type WorkspaceContextValue = WorkspaceState & {
  setPlaylists: (v: Playlist[] | ((prev: Playlist[]) => Playlist[])) => void
  setSelectedPlaylistId: (v: number | null | ((prev: number | null) => number | null)) => void
  setSelectedLesson: (v: Lesson | null | ((prev: Lesson | null) => Lesson | null)) => void
  setLessons: (v: Lesson[] | ((prev: Lesson[]) => Lesson[])) => void
  setSentences: (v: Sentence[] | ((prev: Sentence[]) => Sentence[])) => void
  setSentencesVideoId: (v: number | null | ((prev: number | null) => number | null)) => void
  setCurrentSentenceIndex: (v: number | ((prev: number) => number)) => void
  setIsPlaying: (v: boolean | ((prev: boolean) => boolean)) => void
  setCurrentTime: (v: number | ((prev: number) => number)) => void
  setPlaybackSpeed: (v: number) => void
  setPauseInterval: (v: number) => void
  setIgnorePunctuation: (v: boolean) => void
  setIgnoreCase: (v: boolean) => void
  setRepeatCount: (v: number | '∞') => void
  setTtsVoiceName: (v: string) => void
  setTtsWordByWord: (v: boolean) => void
  setTtsWordInterval: (v: number) => void
  setTtsWordsPerGap: (v: number) => void
  setWordInputs: (v: string[] | ((prev: string[]) => string[])) => void
  setWordHintIndex: (v: number | null) => void
  setWordHintUsed: (v: boolean[] | ((prev: boolean[]) => boolean[])) => void
  setWordErrorChars: (v: number[] | ((prev: number[]) => number[])) => void
  setVideoSessionScores: (v: VideoSessionScores | ((prev: VideoSessionScores) => VideoSessionScores)) => void
  resetVideoSessionScores: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Load once per Provider mount so navigating back (which remounts the
  // Provider) restores the latest snapshot. Stored in localStorage, so the
  // selected lesson and position also survive closing the app.
  const [persistedSnapshot] = useState(loadPersistedState)
  const p = persistedSnapshot ?? {}

  const [playlists, setPlaylists] = useState<Playlist[]>(p.playlists ?? initialState.playlists)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(p.selectedPlaylistId ?? initialState.selectedPlaylistId)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(p.selectedLesson ?? initialState.selectedLesson)
  const [lessons, setLessons] = useState<Lesson[]>(p.lessons ?? initialState.lessons)
  const [sentences, setSentences] = useState<Sentence[]>(p.sentences ?? initialState.sentences)
  const [sentencesVideoId, setSentencesVideoId] = useState<number | null>(p.sentencesVideoId ?? initialState.sentencesVideoId)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(p.currentSentenceIndex ?? initialState.currentSentenceIndex)
  const [isPlaying, setIsPlaying] = useState(initialState.isPlaying)
  const [currentTime, setCurrentTime] = useState(p.currentTime ?? initialState.currentTime)
  const [durable] = useState(loadDurableSettings)
  const [playbackSpeed, setPlaybackSpeed] = useState(durable.playbackSpeed ?? p.playbackSpeed ?? initialState.playbackSpeed)
  const [pauseInterval, setPauseInterval] = useState(durable.pauseInterval ?? p.pauseInterval ?? initialState.pauseInterval)
  const [ignorePunctuation, setIgnorePunctuation] = useState(durable.ignorePunctuation ?? p.ignorePunctuation ?? initialState.ignorePunctuation)
  const [ignoreCase, setIgnoreCase] = useState(durable.ignoreCase ?? p.ignoreCase ?? initialState.ignoreCase)
  const [repeatCount, setRepeatCount] = useState<number | '∞'>(durable.repeatCount ?? p.repeatCount ?? initialState.repeatCount)

  const [ttsVoiceName, setTtsVoiceNameState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY)
      if (saved !== null) return saved
    } catch {
      // storage unavailable — fall back to the session snapshot
    }
    return p.ttsVoiceName ?? initialState.ttsVoiceName
  })
  const setTtsVoiceName = useCallback((v: string) => {
    setTtsVoiceNameState(v)
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, v)
    } catch {
      // storage unavailable — the choice still applies for this session
    }
  }, [])
  const [ttsWordByWord, setTtsWordByWord] = useState<boolean>(durable.ttsWordByWord ?? p.ttsWordByWord ?? initialState.ttsWordByWord)
  const [ttsWordInterval, setTtsWordInterval] = useState<number>(durable.ttsWordInterval ?? p.ttsWordInterval ?? initialState.ttsWordInterval)
  const [ttsWordsPerGap, setTtsWordsPerGap] = useState<number>(durable.ttsWordsPerGap ?? p.ttsWordsPerGap ?? initialState.ttsWordsPerGap)

  // Persist playback, grading and word-by-word settings across app restarts
  useEffect(() => {
    try {
      localStorage.setItem(
        DURABLE_STORAGE_KEY,
        JSON.stringify({
          pauseInterval,
          repeatCount,
          ignorePunctuation,
          ignoreCase,
          playbackSpeed,
          ttsWordByWord,
          ttsWordInterval,
          ttsWordsPerGap,
        })
      )
    } catch {
      // storage unavailable — settings still apply for this session
    }
  }, [
    pauseInterval,
    repeatCount,
    ignorePunctuation,
    ignoreCase,
    playbackSpeed,
    ttsWordByWord,
    ttsWordInterval,
    ttsWordsPerGap,
  ])
  const [wordInputs, setWordInputs] = useState<string[]>(p.wordInputs ?? initialState.wordInputs)
  const [wordHintIndex, setWordHintIndex] = useState<number | null>(initialState.wordHintIndex)
  const [wordHintUsed, setWordHintUsed] = useState<boolean[]>(p.wordHintUsed ?? initialState.wordHintUsed)
  const [wordErrorChars, setWordErrorChars] = useState<number[]>(p.wordErrorChars ?? initialState.wordErrorChars)
  const [videoSessionScores, setVideoSessionScores] = useState<VideoSessionScores>(p.videoSessionScores ?? { ...defaultScores })

  const resetVideoSessionScores = useCallback(() => {
    setVideoSessionScores({ ...defaultScores })
  }, [])

  useEffect(() => {
    try {
      const payload: WorkspaceState = {
        playlists,
        selectedPlaylistId,
        selectedLesson,
        lessons,
        sentences,
        sentencesVideoId,
        currentSentenceIndex,
        isPlaying,
        currentTime,
        playbackSpeed,
        pauseInterval,
        ignorePunctuation,
        ignoreCase,
        repeatCount,
        ttsVoiceName,
        ttsWordByWord,
        ttsWordInterval,
        ttsWordsPerGap,
        wordInputs,
        wordHintIndex,
        wordHintUsed,
        wordErrorChars,
        videoSessionScores,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }, [
    playlists,
    selectedPlaylistId,
    selectedLesson,
    lessons,
    sentences,
    sentencesVideoId,
    currentSentenceIndex,
    isPlaying,
    currentTime,
    playbackSpeed,
    pauseInterval,
    ignorePunctuation,
    ignoreCase,
    repeatCount,
    ttsVoiceName,
    ttsWordByWord,
    ttsWordInterval,
    ttsWordsPerGap,
    wordInputs,
    wordHintIndex,
    wordHintUsed,
    wordErrorChars,
    videoSessionScores,
  ])

  const value: WorkspaceContextValue = {
    playlists,
    setPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    selectedLesson,
    setSelectedLesson,
    lessons,
    setLessons,
    sentences,
    setSentences,
    sentencesVideoId,
    setSentencesVideoId,
    currentSentenceIndex,
    setCurrentSentenceIndex,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    playbackSpeed,
    setPlaybackSpeed,
    pauseInterval,
    setPauseInterval,
    ignorePunctuation,
    setIgnorePunctuation,
    ignoreCase,
    setIgnoreCase,
    repeatCount,
    setRepeatCount,
    ttsVoiceName,
    setTtsVoiceName,
    ttsWordByWord,
    setTtsWordByWord,
    ttsWordInterval,
    setTtsWordInterval,
    ttsWordsPerGap,
    setTtsWordsPerGap,
    wordInputs,
    setWordInputs,
    wordHintIndex,
    setWordHintIndex,
    wordHintUsed,
    setWordHintUsed,
    wordErrorChars,
    setWordErrorChars,
    videoSessionScores,
    setVideoSessionScores,
    resetVideoSessionScores,
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
