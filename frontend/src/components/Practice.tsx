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
import { WordLists } from './practice/WordLists'
import { AddWordsSidebar } from './practice/AddWordsSidebar'
import { DrillCard } from './practice/DrillCard'

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
        <AddWordsSidebar
          sidebarOpen={sidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          newWords={newWords}
          setNewWords={setNewWords}
          adding={adding}
          addMessage={addMessage}
          customWords={customWords}
          binnedSet={binnedSet}
          handleAddWords={handleAddWords}
          displayOf={displayOf}
        />

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
              <DrillCard
                index={index}
                words={words}
                target={target}
                value={value}
                isCorrect={isCorrect}
                hintShown={hintShown}
                underlineClass={underlineClass}
                playbackSpeed={playbackSpeed}
                inputRef={inputRef}
                translationVisible={translationVisible}
                translationLoading={translationLoading}
                translationError={translationError}
                translation={translation}
                handleChange={handleChange}
                setHintShown={setHintShown}
                speak={speak}
                spell={spell}
                toggleTranslation={toggleTranslation}
                stepSpeed={stepSpeed}
                goTo={goTo}
                goRandom={goRandom}
              />

              <WordLists
                words={words}
                binList={binList}
                pageWords={pageWords}
                page={page}
                pageCount={pageCount}
                setPage={setPage}
                index={index}
                tableVisible={tableVisible}
                setTableVisible={setTableVisible}
                binVisible={binVisible}
                setBinVisible={setBinVisible}
                deleting={deleting}
                bulkBusy={bulkBusy}
                goTo={goTo}
                handleBin={handleBin}
                handleRecover={handleRecover}
                handleDeleteForever={handleDeleteForever}
                handleRecoverAll={handleRecoverAll}
                handleDeleteAllForever={handleDeleteAllForever}
                displayOf={displayOf}
              />
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
