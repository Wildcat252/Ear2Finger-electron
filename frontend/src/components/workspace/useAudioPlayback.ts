import { useEffect, type MutableRefObject } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'

interface UseAudioPlaybackParams {
  audioRef: MutableRefObject<HTMLAudioElement | null>
  intervalTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  isWaitingForPauseIntervalRef: MutableRefObject<boolean>
  repeatCountRef: MutableRefObject<number>
  programmaticSeekRef: MutableRefObject<boolean>
  userInitiatedSentenceChangeRef: MutableRefObject<boolean>
  sentenceIndexFromPlaybackRef: MutableRefObject<boolean>
  skipNextSentenceResetRef: MutableRefObject<boolean>
  prevSentencesIdentityRef: MutableRefObject<string | null>
  /** Mirror of isCurrentSentenceFullyCorrect, read inside the advance interval */
  isCurrentSentenceFullyCorrectRef: MutableRefObject<boolean>
}

/**
 * Drives the <audio> element for non-text lessons: playback rate, progress
 * sync, sentence-by-sentence advance with repeat/pause-interval, seeking on
 * sentence change, and play/pause. Text (TTS) lessons are handled by
 * useTtsPlayback and are skipped here.
 */
export function useAudioPlayback({
  audioRef,
  intervalTimeoutRef,
  isWaitingForPauseIntervalRef,
  repeatCountRef,
  programmaticSeekRef,
  userInitiatedSentenceChangeRef,
  sentenceIndexFromPlaybackRef,
  skipNextSentenceResetRef,
  prevSentencesIdentityRef,
  isCurrentSentenceFullyCorrectRef,
}: UseAudioPlaybackParams) {
  const {
    selectedLesson,
    sentences,
    sentencesVideoId,
    currentSentenceIndex,
    setCurrentSentenceIndex,
    isPlaying,
    setIsPlaying,
    setCurrentTime,
    playbackSpeed,
    pauseInterval,
    repeatCount,
    wordInputs,
    ignoreCase,
    ignorePunctuation,
  } = useWorkspace()

  // Update audio playback speed when speed changes
  useEffect(() => {
    if (selectedLesson?.youtube_url?.startsWith('text://')) return
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed, selectedLesson])

  // Handle time updates: keep progress bar (currentTime) in sync with audio playback
  useEffect(() => {
    if (selectedLesson?.youtube_url?.startsWith('text://')) return
    const audio = audioRef.current
    if (!audio || !sentences.length) return

    const updateTime = () => {
      const t = audio.currentTime
      setCurrentTime(t)
    }

    audio.addEventListener('timeupdate', updateTime)
    return () => audio.removeEventListener('timeupdate', updateTime)
  }, [sentences, selectedLesson])

  // Handle sentence-by-sentence playback
  useEffect(() => {
    if (selectedLesson?.youtube_url?.startsWith('text://')) return
    const audio = audioRef.current
    if (!audio || !sentences.length || !isPlaying) return

    const currentSentence = sentences[currentSentenceIndex]
    if (!currentSentence) return

    const totalDuration = selectedLesson?.duration ?? 0

    const checkSentenceEnd = () => {
      if (!isPlaying) return

      const nextSentence = sentences[currentSentenceIndex + 1]
      const endTime = nextSentence
        ? nextSentence.start_time
        : totalDuration

      if (!endTime || endTime <= 0) return

      const hasReachedEnd = audio.currentTime >= endTime - 0.01
      if (!hasReachedEnd) return

      // When repeat is ∞, only advance when the user has spelled the current sentence fully correctly
      const shouldRepeat =
        repeatCount === '∞'
          ? !isCurrentSentenceFullyCorrectRef.current
          : (typeof repeatCount === 'number' && repeatCountRef.current <= repeatCount - 1)

      if (pauseInterval > 0) {
        // Simulate "click pause" at start: UI and audio show paused
        isWaitingForPauseIntervalRef.current = true
        if (intervalTimeoutRef.current) clearTimeout(intervalTimeoutRef.current)
        intervalTimeoutRef.current = setTimeout(() => {
          isWaitingForPauseIntervalRef.current = false
          intervalTimeoutRef.current = null
          const audioEl = audioRef.current
          if (!audioEl) return
          const playAfterSeek = (targetTime: number) => {
            setCurrentTime(targetTime)
            programmaticSeekRef.current = true
            setIsPlaying(true)
            const onSeeked = () => {
              audioEl.removeEventListener('seeked', onSeeked)
              clearTimeout(fallback)
              audioEl.play().catch(() => { })
            }
            audioEl.addEventListener('seeked', onSeeked, { once: true })
            audioEl.currentTime = targetTime
            const fallback = setTimeout(() => {
              if (audioEl.paused) {
                audioEl.removeEventListener('seeked', onSeeked)
                audioEl.play().catch(() => { })
              }
            }, 200)
          }
          if (shouldRepeat) {
            repeatCountRef.current++
            if (currentSentence) {
              playAfterSeek(currentSentence.start_time)
            } else {
              setIsPlaying(true)
            }
          } else {
            repeatCountRef.current = 0
            if (currentSentenceIndex < sentences.length - 1) {
              const nextIndex = currentSentenceIndex + 1
              setCurrentSentenceIndex(nextIndex)
              const ns = sentences[nextIndex]
              if (ns) {
                playAfterSeek(ns.start_time)
                userInitiatedSentenceChangeRef.current = true
              } else {
                setIsPlaying(true)
              }
            } else {
              setCurrentSentenceIndex(0)
              audioEl.currentTime = 0
              setCurrentTime(0)
            }
          }
        }, pauseInterval * 1000)
        setIsPlaying(false) // simulate "click pause"
      } else {
        if (shouldRepeat) {
          repeatCountRef.current++
          const audioEl = audioRef.current
          if (audioEl && currentSentence) {
            setCurrentTime(currentSentence.start_time)
            programmaticSeekRef.current = true
            const onSeeked = () => {
              audioEl.removeEventListener('seeked', onSeeked)
              audioEl.play().catch(() => { })
            }
            audioEl.addEventListener('seeked', onSeeked, { once: true })
            audioEl.currentTime = currentSentence.start_time
          }
        } else {
          repeatCountRef.current = 0
          const audioEl = audioRef.current
          if (!audioEl) return
          if (currentSentenceIndex < sentences.length - 1) {
            const nextIndex = currentSentenceIndex + 1
            setCurrentSentenceIndex(nextIndex)
            const ns = sentences[nextIndex]
            if (ns) {
              setCurrentTime(ns.start_time)
              programmaticSeekRef.current = true
              const onSeeked = () => {
                audioEl.removeEventListener('seeked', onSeeked)
                audioEl.play().catch(() => { })
              }
              audioEl.addEventListener('seeked', onSeeked, { once: true })
              audioEl.currentTime = ns.start_time
            }
          } else {
            setIsPlaying(false)
            setCurrentSentenceIndex(0)
            audioEl.pause()
            audioEl.currentTime = 0
          }
        }
      }
    }

    const intervalId = setInterval(checkSentenceEnd, 20) // Check more frequently for better accuracy
    return () => {
      clearInterval(intervalId)
      if (intervalTimeoutRef.current && !isWaitingForPauseIntervalRef.current) {
        clearTimeout(intervalTimeoutRef.current)
        intervalTimeoutRef.current = null
      }
    }
  }, [currentSentenceIndex, sentences, isPlaying, pauseInterval, repeatCount, selectedLesson?.duration, wordInputs, ignoreCase, ignorePunctuation])

  // Keep audio progress in sync with current subtitle: seek to current sentence's start_time when subtitle changes.
  useEffect(() => {
    if (!audioRef.current || !sentences.length) return
    const sentence = sentences[currentSentenceIndex]
    if (!sentence) return
    if (programmaticSeekRef.current) {
      programmaticSeekRef.current = false
      return
    }
    if (userInitiatedSentenceChangeRef.current) {
      userInitiatedSentenceChangeRef.current = false
      return
    }
    if (sentenceIndexFromPlaybackRef.current) {
      sentenceIndexFromPlaybackRef.current = false
      return
    }
    audioRef.current.currentTime = sentence.start_time
    setCurrentTime(sentence.start_time)
  }, [currentSentenceIndex, sentences])

  // Reset to sentence 0 only when sentences actually change (e.g. new lesson). Do not reset on remount or Strict Mode double-invocation.
  useEffect(() => {
    if (sentences.length === 0) return
    const identity = `${sentencesVideoId ?? ''}-${sentences.length}-${sentences[0]?.id ?? ''}`
    if (prevSentencesIdentityRef.current === identity) return
    const isNewSentences = prevSentencesIdentityRef.current !== null
    prevSentencesIdentityRef.current = identity
    if (skipNextSentenceResetRef.current) {
      skipNextSentenceResetRef.current = false
      return
    }
    if (isNewSentences && !isPlaying) {
      setCurrentSentenceIndex(0)
      repeatCountRef.current = 0
      if (audioRef.current) {
        audioRef.current.currentTime = sentences[0].start_time
      }
    }
  }, [sentences, sentencesVideoId, isPlaying])

  // Handle play/pause
  useEffect(() => {
    if (selectedLesson?.youtube_url?.startsWith('text://')) return
    const audio = audioRef.current
    if (!audio || !sentences.length) return

    if (isPlaying) {
      if (intervalTimeoutRef.current) {
        clearTimeout(intervalTimeoutRef.current)
        intervalTimeoutRef.current = null
      }
      isWaitingForPauseIntervalRef.current = false
      if (programmaticSeekRef.current) {
        programmaticSeekRef.current = false
        audio.play()
        return
      }
      const currentSentence = sentences[currentSentenceIndex]
      if (currentSentence) {
        if (currentSentenceIndex > 0 && audio.currentTime < currentSentence.start_time) {
          audio.currentTime = currentSentence.start_time
        }
        audio.play()
      }
    } else {
      audio.pause()
    }
  }, [isPlaying, currentSentenceIndex, sentences, selectedLesson])
}
