import { useEffect, type MutableRefObject } from 'react'
import { useWorkspace, type Sentence } from '../../contexts/WorkspaceContext'
import type { Keybindings } from '../../keybindings'

/**
 * Global keyboard shortcuts for the Workspace (rebindable in Settings).
 *
 * All playback refs are owned by Workspace and passed in, so this hook only
 * wires key events to the existing behavior.
 */
export function useWorkspaceShortcuts(params: {
  currentSentence: Sentence | null
  keybinds: Keybindings
  speedOptions: number[]
  audioRef: MutableRefObject<HTMLAudioElement | null>
  intervalTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  isWaitingForPauseIntervalRef: MutableRefObject<boolean>
  repeatCountRef: MutableRefObject<number>
  programmaticSeekRef: MutableRefObject<boolean>
  userInitiatedSentenceChangeRef: MutableRefObject<boolean>
  resetTtsWordQueue: () => void
  skipWord: () => void
  prevWord: () => void
  toggleTranslation: () => void
}) {
  const {
    currentSentence,
    keybinds,
    speedOptions: SPEED_OPTIONS,
    audioRef,
    intervalTimeoutRef,
    isWaitingForPauseIntervalRef,
    repeatCountRef,
    programmaticSeekRef,
    userInitiatedSentenceChangeRef,
    resetTtsWordQueue,
    skipWord: ttsSkipWord,
    prevWord: ttsPrevWord,
    toggleTranslation,
  } = params

  const {
    selectedLesson,
    sentences,
    currentSentenceIndex,
    setCurrentSentenceIndex,
    setCurrentTime,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    ttsWordByWord,
    setTtsWordByWord,
  } = useWorkspace()

  // Keyboard shortcuts (rebindable in Settings → Keyboard shortcuts).
  // Defaults: [ previous sentence, ] next sentence, \ replay sentence,
  // Enter play/pause, Command (tap) toggle word-by-word, ` translate,
  // - / = decrease / increase playback speed
  useEffect(() => {
    // Tracks whether the Command key was used as part of a combo (e.g. Cmd+C),
    // so that only a plain Command tap toggles word-by-word.
    let metaCombo = false

    const toggleWordByWord = () => {
      // Word-by-word mode only exists for TTS (text://) lessons
      if (!selectedLesson?.youtube_url?.startsWith('text://')) return
      resetTtsWordQueue()
      setTtsWordByWord(!ttsWordByWord)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Any key pressed while Command is held makes this a combo, not a tap.
      // Checked before the input guard so combos inside inputs are caught too.
      if (e.metaKey && e.key !== 'Meta') metaCombo = true

      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      const isShortcutKey = Object.values(keybinds).includes(e.key)
      if (inInput && !isShortcutKey) return

      if (e.key === keybinds.wordByWord && keybinds.wordByWord !== 'Meta') {
        e.preventDefault()
        toggleWordByWord()
        return
      }
      if (e.key === keybinds.prevSentence) {
        e.preventDefault()
        if (currentSentenceIndex > 0 && sentences.length) {
          userInitiatedSentenceChangeRef.current = true
          const prevIndex = currentSentenceIndex - 1
          setCurrentSentenceIndex(prevIndex)
          repeatCountRef.current = 0
          resetTtsWordQueue()
          if (selectedLesson?.youtube_url?.startsWith('text://')) {
            setCurrentTime(sentences[prevIndex].start_time)
          } else if (audioRef.current && sentences[prevIndex]) {
            audioRef.current.currentTime = sentences[prevIndex].start_time
            setCurrentTime(sentences[prevIndex].start_time)
          }
        }
        return
      }
      if (e.key === keybinds.nextSentence) {
        e.preventDefault()
        if (currentSentenceIndex >= sentences.length - 1) return
        const nextIndex = currentSentenceIndex + 1
        const nextSentence = sentences[nextIndex]
        if (!nextSentence) return
        userInitiatedSentenceChangeRef.current = true
        if (intervalTimeoutRef.current) {
          clearTimeout(intervalTimeoutRef.current)
          intervalTimeoutRef.current = null
        }
        isWaitingForPauseIntervalRef.current = false
        repeatCountRef.current = 0
        resetTtsWordQueue()
        setCurrentSentenceIndex(nextIndex)
        setCurrentTime(nextSentence.start_time)
        if (selectedLesson?.youtube_url?.startsWith('text://')) {
          setCurrentTime(nextSentence.start_time)
        } else if (audioRef.current) {
          audioRef.current.currentTime = nextSentence.start_time
          audioRef.current.play().catch(() => { })
        }
        setIsPlaying(true)
        return
      }
      if (e.key === keybinds.replay) {
        e.preventDefault()
        if (!selectedLesson || !sentences.length || !currentSentence) return
        resetTtsWordQueue()
        repeatCountRef.current = 0
        if (selectedLesson.youtube_url?.startsWith('text://')) {
          window.speechSynthesis.cancel()
          setIsPlaying(false)
          setTimeout(() => setIsPlaying(true), 10)
        } else if (audioRef.current) {
          audioRef.current.currentTime = currentSentence.start_time
          setCurrentTime(currentSentence.start_time)
          programmaticSeekRef.current = true
          audioRef.current.play().catch(() => { })
          setIsPlaying(true)
        }
        return
      }
      if (e.key === keybinds.translate) {
        e.preventDefault()
        toggleTranslation()
        return
      }
      if (e.key === keybinds.skipWord) {
        e.preventDefault()
        ttsSkipWord()
        return
      }
      if (e.key === keybinds.prevWord) {
        e.preventDefault()
        ttsPrevWord()
        return
      }
      if (e.key === keybinds.speedDown || e.key === keybinds.speedUp) {
        e.preventDefault()
        const idx = SPEED_OPTIONS.indexOf(playbackSpeed)
        // Fall back to the nearest known step if the current speed isn't in the list.
        const current = idx === -1
          ? SPEED_OPTIONS.reduce((best, s, i) => Math.abs(s - playbackSpeed) < Math.abs(SPEED_OPTIONS[best] - playbackSpeed) ? i : best, 0)
          : idx
        const nextIdx = e.key === keybinds.speedUp ? current + 1 : current - 1
        if (nextIdx >= 0 && nextIdx < SPEED_OPTIONS.length) {
          setPlaybackSpeed(SPEED_OPTIONS[nextIdx])
        }
        return
      }
      if (e.key === keybinds.playPause) {
        e.preventDefault()
        if (!selectedLesson || !sentences.length) return
        setIsPlaying((prev) => !prev)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // Command-tap detection only applies when word-by-word is bound to Meta
      if (keybinds.wordByWord !== 'Meta' || e.key !== 'Meta') return
      const wasCombo = metaCombo
      metaCombo = false
      if (wasCombo) return
      toggleWordByWord()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [currentSentenceIndex, sentences, selectedLesson, resetTtsWordQueue, ttsWordByWord, setTtsWordByWord, toggleTranslation, playbackSpeed, setPlaybackSpeed, keybinds])
}
