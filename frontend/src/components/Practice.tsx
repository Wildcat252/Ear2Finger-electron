import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { AppHeader } from './AppHeader'
import {
  getUserStats,
  getPracticeWordStates,
  binPracticeWord,
  recoverPracticeWord,
  deletePracticeWord,
  addPracticeWords,
  translateText,
  type WordStat,
} from '../api'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePremiumVoices } from '../voices'
import { loadAudioSettings, playCelebrationChime, playMistakeBuzz } from '../audio'

const PAGE_SIZE = 30
const SPEED_OPTIONS = [0.2, 0.4, 0.6, 0.8, 1, 1.2]
const STATE_KEY = 'ear2finger-practice-state'

/** Strip surrounding punctuation the way the stats list stores it. */
function displayOf(word: string): string {
  return (word || '').replace(/^[^\w]+|[^\w]+$/g, '') || word
}

/** Hand-added words have no practice history, so stand in a zeroed stat row. */
function customStat(word: string): WordStat {
  return {
    word,
    total_count: 0,
    incorrect_count: 0,
    hint_count: 0,
    incorrect_rate: 0,
    hint_rate: 0,
    error_char_count: 0,
    error_char_rate: 0,
    average_spell_retry_times: 1,
    latest_spell_retry_times: 1,
  }
}

interface PersistedPracticeState {
  word: string | null
  value: string
  hintShown: boolean
  tableVisible: boolean
  binVisible: boolean
  sidebarCollapsed: boolean
  page: number
}

function loadPracticeState(): Partial<PersistedPracticeState> {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<PersistedPracticeState>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function savePracticeState(state: PersistedPracticeState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable — state just won't persist
  }
}

export default function Practice() {
  const { ttsVoiceName, playbackSpeed, setPlaybackSpeed, ignoreCase, ignorePunctuation } = useWorkspace()
  const availableVoices = usePremiumVoices()
  const [audio] = useState(loadAudioSettings)
  // Read once on mount so leaving and returning restores where you left off
  const [restored] = useState(loadPracticeState)

  const [trickyWords, setTrickyWords] = useState<WordStat[]>([])
  const [customWords, setCustomWords] = useState<string[]>([])
  const [binned, setBinned] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [index, setIndex] = useState(0)
  const [value, setValue] = useState(restored.value ?? '')
  const [hintShown, setHintShown] = useState(restored.hintShown ?? false)
  const [page, setPage] = useState(restored.page ?? 0)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [tableVisible, setTableVisible] = useState(restored.tableVisible ?? false)
  const [binVisible, setBinVisible] = useState(restored.binVisible ?? false)

  // "Add words" sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(restored.sidebarCollapsed ?? false)
  /** One header button drives both breakpoints: drawer on mobile, collapse on desktop. */
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setSidebarCollapsed((v) => !v)
    } else {
      setSidebarOpen((v) => !v)
    }
  }, [])
  const [newWords, setNewWords] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMessage, setAddMessage] = useState<string | null>(null)

  // Translation of the current word (` toggles it), language shared with the Workspace
  const [translateLang] = useState(() => localStorage.getItem('ear2finger-translate-lang') ?? 'vi')
  const [translationVisible, setTranslationVisible] = useState(false)
  const [translation, setTranslation] = useState<string | null>(null)
  const [translationLoading, setTranslationLoading] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const translationCacheRef = useRef<Map<string, string>>(new Map())

  const inputRef = useRef<HTMLInputElement | null>(null)
  // TTS anti-clipping refs (same approach as the Workspace player)
  const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledIntentionallyRef = useRef(false)
  const cancelPendingRef = useRef(false)
  const chimedRef = useRef(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([getUserStats(), getPracticeWordStates()])
      .then(([stats, states]) => {
        const deleted = new Set(states.deleted)
        const tricky = [...(stats.top_incorrect_words ?? [])]
          .filter((w) => (w.latest_spell_retry_times ?? 1) > 1 && !deleted.has(w.word))
          .sort((a, b) => (b.latest_spell_retry_times ?? 0) - (a.latest_spell_retry_times ?? 0))
        setTrickyWords(tricky)
        setCustomWords(states.custom)
        setBinned(states.binned)
        // Resume on the word we left off at (matched by string; the list is rebuilt each load)
        if (restored.word) {
          const binnedSet = new Set(states.binned)
          const trickySet = new Set(tricky.map((w) => w.word))
          const merged = [
            ...tricky,
            ...states.custom.filter((w) => !trickySet.has(w)).map(customStat),
          ]
          const at = merged.filter((w) => !binnedSet.has(w.word)).findIndex((w) => w.word === restored.word)
          if (at >= 0) setIndex(at)
        }
      })
      .catch(() => setError('Failed to load your tricky words.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Auto-derived tricky words plus any the user added by hand. */
  const allWords = useMemo(() => {
    const seen = new Set(trickyWords.map((w) => w.word))
    return [...trickyWords, ...customWords.filter((w) => !seen.has(w)).map(customStat)]
  }, [trickyWords, customWords])

  const customSet = useMemo(() => new Set(customWords), [customWords])
  const binnedSet = useMemo(() => new Set(binned), [binned])
  /** The drill only cycles through words that aren't binned. */
  const words = useMemo(
    () => allWords.filter((w) => !binnedSet.has(w.word)),
    [allWords, binnedSet]
  )
  const binList = useMemo(
    () => allWords.filter((w) => binnedSet.has(w.word)),
    [allWords, binnedSet]
  )

  const current = words[index] ?? null
  const target = current ? displayOf(current.word) : ''

  const normalizeWord = useCallback(
    (w: string) => {
      let s = w
      if (ignoreCase) s = s.toLowerCase()
      if (ignorePunctuation) s = s.replace(/[^\w\s,.?!]/g, '')
      return s
    },
    [ignoreCase, ignorePunctuation]
  )

  const isCorrect = Boolean(target) && normalizeWord(value) === normalizeWord(target)

  /**
   * Speak one or more parts back-to-back without clipping the start
   * (silent primer + deferred speak). Multiple parts are queued, which the
   * engine plays sequentially with a natural gap — used for spelling.
   */
  const speakParts = useCallback(
    (parts: string[], rate?: number) => {
      const texts = parts.filter(Boolean)
      if (texts.length === 0) return
      const synth = window.speechSynthesis
      const selectedVoice = ttsVoiceName
        ? availableVoices.find((v) => v.name === ttsVoiceName) || null
        : null
      const speechRate = rate ?? playbackSpeed

      if (speakTimeoutRef.current) {
        clearTimeout(speakTimeoutRef.current)
        speakTimeoutRef.current = null
      }

      const primeAndSpeak = () => {
        const primer = new SpeechSynthesisUtterance('.')
        primer.volume = 0
        primer.rate = speechRate
        if (selectedVoice) primer.voice = selectedVoice
        synth.speak(primer)
        for (const text of texts) {
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = speechRate
          if (selectedVoice) utterance.voice = selectedVoice
          synth.speak(utterance)
        }
      }

      if (synth.speaking || synth.pending || cancelPendingRef.current) {
        cancelledIntentionallyRef.current = true
        synth.cancel()
        cancelPendingRef.current = true
        speakTimeoutRef.current = setTimeout(() => {
          speakTimeoutRef.current = null
          cancelledIntentionallyRef.current = false
          cancelPendingRef.current = false
          primeAndSpeak()
        }, 10)
      } else {
        cancelledIntentionallyRef.current = false
        primeAndSpeak()
      }
    },
    [availableVoices, playbackSpeed, ttsVoiceName]
  )

  const speak = useCallback((text: string) => speakParts([text]), [speakParts])

  /** Read the word out one letter at a time. */
  const spell = useCallback(() => {
    if (!target) return
    // Letters only — punctuation inside a word would be read aloud by name
    const letters = Array.from(target).filter((ch) => /[^\s]/.test(ch))
    // Cap the rate so spelling stays intelligible at high playback speeds
    speakParts(letters, Math.min(playbackSpeed, 1))
  }, [speakParts, target, playbackSpeed])

  const toggleTranslation = useCallback(() => {
    if (!target) return
    if (translationVisible) {
      setTranslationVisible(false)
      return
    }
    setTranslationVisible(true)
    setTranslationError(null)
    const cacheKey = `${target}:${translateLang}`
    const cached = translationCacheRef.current.get(cacheKey)
    if (cached) {
      setTranslation(cached)
      return
    }
    setTranslation(null)
    setTranslationLoading(true)
    translateText(target, translateLang)
      .then((data) => {
        translationCacheRef.current.set(cacheKey, data.translation)
        setTranslation(data.translation)
      })
      .catch((e) => {
        const err = e as { response?: { data?: { detail?: string } } }
        setTranslationError(
          err.response?.data?.detail ||
          'Translation is unavailable. Check your internet connection.'
        )
      })
      .finally(() => setTranslationLoading(false))
  }, [target, translateLang, translationVisible])

  // Speak whenever the drill moves to a different word. The first run after
  // mount keeps any restored answer and does NOT auto-speak — only Replay,
  // Enter, or actually moving to another word should trigger audio.
  const firstTargetRef = useRef(true)
  useEffect(() => {
    if (!target) return
    if (firstTargetRef.current) {
      firstTargetRef.current = false
      chimedRef.current = true // don't re-chime a restored, already-correct answer
      inputRef.current?.focus()
      return
    }
    setValue('')
    setHintShown(false)
    setTranslationVisible(false)
    setTranslation(null)
    setTranslationError(null)
    chimedRef.current = false
    speak(target)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // Persist enough state to resume exactly where the user left off
  useEffect(() => {
    if (loading) return
    savePracticeState({
      word: current?.word ?? null,
      value,
      hintShown,
      tableVisible,
      binVisible,
      sidebarCollapsed,
      page,
    })
  }, [current?.word, value, hintShown, tableVisible, binVisible, sidebarCollapsed, page, loading])

  useEffect(() => {
    return () => {
      if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current)
      window.speechSynthesis.cancel()
    }
  }, [])

  const goTo = useCallback(
    (nextIndex: number) => {
      if (words.length === 0) return
      const wrapped = ((nextIndex % words.length) + words.length) % words.length
      setIndex(wrapped)
      setPage(Math.floor(wrapped / PAGE_SIZE))
    },
    [words.length]
  )

  /** Jump to a random word, avoiding the one already showing. */
  const goRandom = useCallback(() => {
    if (words.length === 0) return
    if (words.length === 1) {
      goTo(0)
      return
    }
    let next = index
    while (next === index) next = Math.floor(Math.random() * words.length)
    goTo(next)
  }, [goTo, index, words.length])

  const stepSpeed = useCallback(
    (direction: 1 | -1) => {
      const idx = SPEED_OPTIONS.indexOf(playbackSpeed)
      // Snap to the nearest known step if the current speed isn't in the list
      const from = idx === -1
        ? SPEED_OPTIONS.reduce(
          (best, s, i) =>
            Math.abs(s - playbackSpeed) < Math.abs(SPEED_OPTIONS[best] - playbackSpeed) ? i : best,
          0
        )
        : idx
      const next = from + direction
      if (next >= 0 && next < SPEED_OPTIONS.length) setPlaybackSpeed(SPEED_OPTIONS[next])
    },
    [playbackSpeed, setPlaybackSpeed]
  )

  // Shortcuts: Enter replay, [ previous, ] next, Tab hint, ` translate,
  // - / = slower / faster, / random word, \\ spell. These fire even while the answer
  // input has focus, so they must not be characters you'd type.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        speak(target)
        return
      }
      if (e.key === '[') {
        e.preventDefault()
        goTo(index - 1)
        return
      }
      if (e.key === ']') {
        e.preventDefault()
        goTo(index + 1)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        setHintShown((h) => !h)
        return
      }
      if (e.key === '`') {
        e.preventDefault()
        toggleTranslation()
        return
      }
      if (e.key === '-' || e.key === '=') {
        e.preventDefault()
        stepSpeed(e.key === '=' ? 1 : -1)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        goRandom()
        return
      }
      if (e.key === '\\') {
        e.preventDefault()
        spell()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goRandom, goTo, index, speak, spell, stepSpeed, target, toggleTranslation])

  const handleChange = (next: string) => {
    const prev = value
    setValue(next)
    if (!target) return

    // Count a wrong character when the normalized prefix first diverges
    if (next.length > prev.length) {
      const targetNorm = normalizeWord(target)
      const prevOk = targetNorm.startsWith(normalizeWord(prev))
      const nextOk = targetNorm.startsWith(normalizeWord(next))
      if (prevOk && !nextOk && audio.errorEnabled) {
        playMistakeBuzz({
          volume: audio.errorVolume,
          freqStart: audio.errorFreqStart,
          freqEnd: audio.errorFreqEnd,
          duration: audio.errorDuration,
          waveform: audio.errorWaveform,
        })
      }
    }

    // Chime once when the word first becomes fully correct
    const nowCorrect = normalizeWord(next) === normalizeWord(target)
    if (nowCorrect && !chimedRef.current) {
      chimedRef.current = true
      if (audio.correctEnabled) {
        playCelebrationChime({
          volume: audio.correctVolume,
          baseFreq: audio.correctBaseFreq,
          noteCount: audio.correctNoteCount,
          noteSpacing: audio.correctNoteSpacing,
          noteDuration: audio.correctNoteDuration,
          waveform: audio.correctWaveform,
        })
      }
    } else if (!nowCorrect) {
      chimedRef.current = false
    }
  }

  /** Move a word to the bin — hidden from the drill but recoverable. */
  const handleBin = async (word: string) => {
    const removedIndex = words.findIndex((w) => w.word === word)
    setDeleting(word)
    setBinned((prev) => (prev.includes(word) ? prev : [...prev, word]))
    if (removedIndex !== -1 && removedIndex < index) {
      setIndex((i) => Math.max(0, i - 1))
    }
    try {
      await binPracticeWord(word)
    } catch {
      setBinned((prev) => prev.filter((w) => w !== word))
      setError(`Could not bin "${displayOf(word)}". Please try again.`)
    } finally {
      setDeleting(null)
    }
  }

  // Shift+Delete bins the word currently in the drill. Registered separately so
  // it can call handleBin, which is defined above this point.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey) return
      // macOS labels Backspace as "delete"; accept the forward-delete key too
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!current) return
      e.preventDefault()
      handleBin(current.word)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, words, index])

  /** Import hand-typed words (split on commas, newlines or spaces). */
  const handleAddWords = async () => {
    const parsed = Array.from(
      new Set(
        newWords
          .split(/[\s,;]+/)
          .map((w) => w.trim())
          .filter(Boolean)
      )
    )
    if (parsed.length === 0) return
    setAdding(true)
    setAddMessage(null)
    setError(null)
    try {
      const states = await addPracticeWords(parsed)
      setCustomWords(states.custom)
      setBinned(states.binned)
      setNewWords('')
      const added = parsed.filter((w) => !customSet.has(w)).length
      setAddMessage(
        added === parsed.length
          ? `Added ${added} word${added === 1 ? '' : 's'}.`
          : `Added ${added} new · ${parsed.length - added} already in the list.`
      )
    } catch {
      setError('Could not add those words. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  /** Take a word back out of the bin. */
  const handleRecover = async (word: string) => {
    setDeleting(word)
    setBinned((prev) => prev.filter((w) => w !== word))
    try {
      await recoverPracticeWord(word)
    } catch {
      setBinned((prev) => (prev.includes(word) ? prev : [...prev, word]))
      setError(`Could not recover "${displayOf(word)}". Please try again.`)
    } finally {
      setDeleting(null)
    }
  }

  /** Permanent delete: clears the word's history and never shows it again. */
  const handleDeleteForever = async (word: string) => {
    const snapshotTricky = trickyWords
    const snapshotCustom = customWords
    const snapshotBin = binned
    setDeleting(word)
    setTrickyWords((prev) => prev.filter((w) => w.word !== word))
    setCustomWords((prev) => prev.filter((w) => w !== word))
    setBinned((prev) => prev.filter((w) => w !== word))
    try {
      await deletePracticeWord(word)
    } catch {
      setTrickyWords(snapshotTricky)
      setCustomWords(snapshotCustom)
      setBinned(snapshotBin)
      setError(`Could not delete "${displayOf(word)}". Please try again.`)
    } finally {
      setDeleting(null)
    }
  }

  /** Recover every binned word at once. */
  const handleRecoverAll = async () => {
    const toRecover = binList.map((w) => w.word)
    if (toRecover.length === 0) return
    setBulkBusy(true)
    setBinned([])
    try {
      await Promise.all(toRecover.map((word) => recoverPracticeWord(word)))
    } catch {
      setBinned(toRecover)
      setError('Could not recover all words. Please try again.')
    } finally {
      setBulkBusy(false)
    }
  }

  /** Permanently delete every binned word at once. */
  const handleDeleteAllForever = async () => {
    const toDelete = binList.map((w) => w.word)
    if (toDelete.length === 0) return
    const snapshotTricky = trickyWords
    const snapshotCustom = customWords
    const snapshotBin = binned
    setBulkBusy(true)
    const toDeleteSet = new Set(toDelete)
    setTrickyWords((prev) => prev.filter((w) => !toDeleteSet.has(w.word)))
    setCustomWords((prev) => prev.filter((w) => !toDeleteSet.has(w)))
    setBinned((prev) => prev.filter((w) => !toDeleteSet.has(w)))
    try {
      await Promise.all(toDelete.map((word) => deletePracticeWord(word)))
    } catch {
      setTrickyWords(snapshotTricky)
      setCustomWords(snapshotCustom)
      setBinned(snapshotBin)
      setError('Could not delete all words. Please try again.')
    } finally {
      setBulkBusy(false)
    }
  }

  const underlineClass = !value
    ? 'border-b-2 border-gray-300'
    : isCorrect
      ? 'border-b-4 border-green-500'
      : normalizeWord(target).startsWith(normalizeWord(value))
        ? 'border-b-4 border-yellow-500'
        : 'border-b-4 border-red-500'

  const pageCount = Math.max(1, Math.ceil((words.length || 1) / PAGE_SIZE))
  const pageWords = useMemo(
    () => words.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [words, page]
  )

  return (
    <div className="h-screen min-h-0 flex flex-col bg-white">
      {/* Header */}
      <AppHeader
        active="practice"
        onToggleSidebar={toggleSidebar}
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Sidebar: import more words */}
        <aside
          className={`w-full md:w-72 shrink-0 bg-gray-50 border-gray-200 border-b md:border-b-0 md:border-r flex flex-col min-h-0 overflow-y-auto ${sidebarOpen ? '' : 'max-md:hidden'
            } ${sidebarCollapsed ? 'md:hidden' : ''}`}
        >

          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-900">Add words</h2>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Type or paste words to practice, separated by commas, spaces or new lines.
            </p>
            <textarea
              value={newWords}
              onChange={(e) => setNewWords(e.target.value)}
              onKeyDown={(e) => {
                // Keep typing local so the page shortcuts don't fire in here
                e.stopPropagation()
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleAddWords()
                }
              }}
              rows={8}
              placeholder={'accommodate\nrhythm, liaison\nconscience'}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none bg-white"
            />
            <button
              type="button"
              onClick={handleAddWords}
              disabled={adding || newWords.trim().length === 0}
              className="mt-2 w-full px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {adding ? 'Adding…' : 'Add to practice'}
            </button>
            {addMessage && (
              <p className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">{addMessage}</p>
            )}

            <div className="mt-5 pt-4 border-t border-gray-200">
              <h3 className="text-xs font-semibold text-gray-900 mb-2">
                Your words <span className="font-normal text-gray-400">({customWords.length})</span>
              </h3>
              {customWords.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Words you add appear here alongside the ones from your dictation mistakes.
                </p>
              ) : (
                <ul className="space-y-1">
                  {customWords.map((w) => (
                    <li
                      key={w}
                      className="flex items-center justify-between gap-2 text-xs font-mono text-gray-700 bg-white border border-gray-200 rounded px-2 py-1"
                    >
                      <span className="truncate">{displayOf(w)}</span>
                      {binnedSet.has(w) && (
                        <span className="text-[10px] font-sans text-gray-400 shrink-0">binned</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-gray-50 overflow-y-auto min-h-0 p-4 md:p-6">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          {loading ? (
            <p className="text-sm text-gray-600">Loading your tricky words…</p>
          ) : allWords.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-700 font-medium">Nothing to practice right now.</p>
              <p className="text-xs text-gray-500 mt-1">
                Words you misspell during dictation show up here so you can drill them.
              </p>
            </div>
          ) : (
            <>
              {/* Drill */}
              {words.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                  <p className="text-sm text-gray-700 font-medium">Every word is in the bin.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Recover one below to keep practicing.
                  </p>
                </div>
              ) : (
              <section className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Listen and type the word
                  </h2>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {index + 1} / {words.length}
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => speak(target)}
                    title="Replay the word (Enter)"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-800"
                  >
                    Replay
                  </button>
                  <button
                    type="button"
                    onClick={spell}
                    title="Spell the word letter by letter (\)"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Spell
                  </button>
                  <button
                    type="button"
                    onClick={() => setHintShown((h) => !h)}
                    title="Reveal or hide the word (Tab)"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${hintShown
                      ? 'border-amber-300 bg-amber-100 text-amber-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      }`}
                  >
                    Hint
                  </button>
                  <button
                    type="button"
                    onClick={toggleTranslation}
                    title="Translate the word (`)"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${translationVisible
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    Translate
                  </button>

                  <div className="ml-auto flex items-center gap-1 text-xs text-gray-600">
                    <span className="mr-1">Speed</span>
                    <button
                      type="button"
                      onClick={() => stepSpeed(-1)}
                      disabled={playbackSpeed <= SPEED_OPTIONS[0]}
                      title="Slower (-)"
                      className="w-7 h-7 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <span className="w-10 text-center tabular-nums font-medium text-gray-900">
                      {playbackSpeed}x
                    </span>
                    <button
                      type="button"
                      onClick={() => stepSpeed(1)}
                      disabled={playbackSpeed >= SPEED_OPTIONS[SPEED_OPTIONS.length - 1]}
                      title="Faster (=)"
                      className="w-7 h-7 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={(e) => handleChange(e.target.value)}
                  placeholder="Type what you hear…"
                  aria-label="Practice word"
                  autoComplete="off"
                  spellCheck={false}
                  className={`w-full bg-transparent border-0 outline-none px-1 py-1 text-gray-900 ${underlineClass}`}
                  style={{ fontSize: 'clamp(1.25rem, 5vw, 2.25rem)' }}
                />

                <div className="mt-3 min-h-[1.75rem] flex items-center gap-3">
                  {isCorrect && (
                    <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-sm">
                      ✔ Correct
                    </span>
                  )}
                  {hintShown && !isCorrect && (
                    <span className="font-mono text-gray-400">{target}</span>
                  )}
                </div>

                {translationVisible && (
                  <div className="mt-1 text-sm md:text-base text-gray-600 italic">
                    {translationLoading && <span>Translating…</span>}
                    {translationError && (
                      <span className="text-red-600 not-italic">{translationError}</span>
                    )}
                    {translation && !translationLoading && !translationError && (
                      <span>{translation}</span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => goTo(index - 1)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(index + 1)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={goRandom}
                      title="Jump to a random word (/)"
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      random
                    </button>
                  </div>
                </div>
              </section>
              )}

              {/* Word list */}
              <section className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <button
                    type="button"
                    onClick={() => setTableVisible((v) => !v)}
                    title="Show or hide the list"
                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600"
                  >
                    <span className={`transition-transform ${tableVisible ? '' : '-rotate-90'}`}>▾</span>
                    Top tricky words
                    <span className="font-normal text-gray-400 text-xs">({words.length})</span>
                  </button>
                  <div className={`flex items-center gap-2 text-[11px] text-gray-500 ${tableVisible ? '' : 'hidden'}`}>
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="px-1.5 py-0.5 rounded border border-gray-200 disabled:opacity-40"
                    >
                      ‹
                    </button>
                    <span>
                      Page {page + 1} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={page + 1 >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      className="px-1.5 py-0.5 rounded border border-gray-200 disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
                {!tableVisible ? null : (
                  <>
                <p className="text-xs text-gray-500 mb-4">
                  Words where your most recent attempt required more than one try. Click one to
                  practice it, or remove it once you've learnt it.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pageWords.map((w) => {
                    const rawRetry = w.latest_spell_retry_times ?? 0
                    const retry = Math.max(1, Math.round(rawRetry))
                    const label = displayOf(w.word)
                    const globalIndex = words.findIndex((x) => x.word === w.word)
                    const isActive = globalIndex === index
                    const intensity =
                      retry >= 9 ? 'bg-rose-900' :
                        retry >= 8 ? 'bg-rose-800' :
                          retry >= 7 ? 'bg-rose-700' :
                            retry >= 6 ? 'bg-rose-600' :
                              retry >= 5 ? 'bg-rose-500' :
                                retry >= 4 ? 'bg-rose-400' :
                                  retry >= 3 ? 'bg-rose-300' :
                                    retry >= 2 ? 'bg-rose-200' :
                                      'bg-rose-100'
                    return (
                      <div
                        key={w.word}
                        onClick={() => goTo(globalIndex)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${isActive
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                          }`}
                      >
                        <div className="text-xs font-mono text-gray-800 truncate">{label}</div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`inline-block w-3 h-3 rounded-sm ${intensity}`}
                            title={`${retry} tries`}
                          />
                          <span className="text-[11px] text-gray-600 tabular-nums">{retry}×</span>
                          <button
                            type="button"
                            disabled={deleting === w.word}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBin(w.word)
                            }}
                            title="I've learnt this word — move it to the bin"
                            aria-label="Move to bin"
                            className="ml-1 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-100 disabled:opacity-40"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                  </>
                )}
              </section>

              {/* Word bin — binned words are hidden from the drill but recoverable */}
              <section className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setBinVisible((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600"
                  >
                    <span className={`transition-transform ${binVisible ? '' : '-rotate-90'}`}>▾</span>
                    Word bin
                    <span className="font-normal text-gray-400 text-xs">({binList.length})</span>
                  </button>
                  {binVisible && binList.length > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={handleRecoverAll}
                        title="Recover all"
                        aria-label="Recover all"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10a8 8 0 1114.32 4.9M3 10V4m0 6h6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={handleDeleteAllForever}
                        title="Delete all permanently"
                        aria-label="Delete all permanently"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {binVisible && (
                  <>
                    {binList.length === 0 ? (
                      <p className="text-xs text-gray-500 mt-3">The bin is empty.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        {binList.map((w) => (
                          <div
                            key={w.word}
                            className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                          >
                            <div className="text-xs font-mono text-gray-700 truncate">
                              {displayOf(w.word)}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={deleting === w.word || bulkBusy}
                                onClick={() => handleRecover(w.word)}
                                title="Recover"
                                aria-label="Recover"
                                className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200 disabled:opacity-40"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10a8 8 0 1114.32 4.9M3 10V4m0 6h6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                disabled={deleting === w.word || bulkBusy}
                                onClick={() => handleDeleteForever(w.word)}
                                title="Delete permanently — this cannot be undone"
                                aria-label="Delete permanently"
                                className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-100 disabled:opacity-40"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
        </main>
      </div>

      {/* Bottom bar: keyboard shortcuts */}
      <footer className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-3 md:px-4 py-2 md:py-1.5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6 text-xs text-gray-600">
        <div className="flex-1 min-w-0 md:pr-4">
          {words.length > 0 && (
            <span className="whitespace-nowrap">
              Word {index + 1} of {words.length}
              {binList.length > 0 && <span className="text-gray-400"> · {binList.length} in bin</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-start md:justify-end">
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">Enter</kbd> replay</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">[</kbd> previous</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">]</kbd> next</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">/</kbd> random</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">\</kbd> spell</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">Tab</kbd> reveal hint</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">`</kbd> translate</span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">-</kbd>
            {' / '}
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">=</kbd> speed
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">Shift</kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono">Delete</kbd> bin word
          </span>
        </div>
      </footer>
    </div>
  )
}
