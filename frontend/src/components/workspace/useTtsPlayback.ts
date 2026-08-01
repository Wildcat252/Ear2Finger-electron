import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'

// Scales the word-by-word TTS gap exponentially by word length so longer words
// give more time to type: 0.5x under 3 letters (quick words need less time),
// 1x (2^0) at 3-6 letters (the baseline Word Gap setting), 4x (2^2) at 10,
// 8x (2^3) at 15, doubling every 5 letters after that, with the exponent
// interpolated smoothly between anchors.
function wordGapMultiplier(word: string): number {
  const length = word.replace(/[^\w]/g, '').length
  if (length <= 3) return 0.4
  if (length <= 6) return 1
  if (length <= 10) return 2.5 ** ((length - 6) / 2)
  return 2.5 ** (2 + (length - 10) / 5)
}

// Each standalone utterance carries trailing padding the engine drops when
// words are merged into one phrase (measured ~180ms at rate 1). Used to keep
// grouped word-by-word playback the same length as ungrouped.
const MERGED_UTTERANCE_PADDING_MS = 180

// Gap after a spoken punctuation name, and the gap kept before it when words
// are grouped, so "Hello" and "comma" never run together.
const PUNCT_GAP_MULTIPLIER = 0.2

// Common punctuation spoken by name in word-by-word mode so the learner
// knows to type it: "hello," is read as "hello" (word gap) "comma".
const SPOKEN_PUNCTUATION: Record<string, string> = {
  ',': 'comma',
  '.': 'period',
  '?': 'question mark',
  '!': 'exclamation mark',
}

/**
 * Drives speech-synthesis playback for text:// lessons, including word-by-word
 * mode, the Words/Gap grouping, sentence repeat and the pause interval.
 *
 * Refs shared with the audio player and lesson handling are passed in; refs
 * used only by speech are owned here.
 */
export function useTtsPlayback(params: {
  availableVoices: SpeechSynthesisVoice[]
  intervalTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  isWaitingForPauseIntervalRef: MutableRefObject<boolean>
  repeatCountRef: MutableRefObject<number>
}) {
  const {
    availableVoices,
    intervalTimeoutRef,
    isWaitingForPauseIntervalRef,
    repeatCountRef,
  } = params

  const {
    selectedLesson,
    sentences,
    currentSentenceIndex,
    setCurrentSentenceIndex,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    repeatCount,
    pauseInterval,
    ttsVoiceName,
    ttsWordByWord,
    ttsWordInterval,
    ttsWordsPerGap,
    ttsWordRepeat,
  } = useWorkspace()

  // Word-by-word queue position, so pause/resume continues mid-sentence
  const wordQueueIndexRef = useRef(0)
  const wordQueueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set by the word-by-word effect; skips the rest of the current word
  // (speech + gap + punctuation) and jumps to the next word immediately.
  const ttsSkipWordRef = useRef<(() => void) | null>(null)
  // Same, in reverse: replays the previous word from its start.
  const ttsPrevWordRef = useRef<(() => void) | null>(null)
  // Set whenever we intentionally cancel, so utterance.onerror does not treat
  // the resulting 'interrupted'/'canceled' error as a playback failure.
  const ttsCancelledIntentionallyRef = useRef(false)
  // Pending deferred speak() (see speakUtterance): after synth.cancel() we wait a
  // tick before speaking so Chromium does not clip the start of the new utterance.
  const ttsSpeakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set whenever we call synth.cancel() (including from the effect's own cleanup,
  // e.g. on auto-advance to the next sentence). synth.speaking/pending can already
  // report false by the time the next effect run checks them, so speakUtterance
  // cannot rely on those alone to know a cancel just happened.
  const ttsCancelPendingRef = useRef(false)
  // Mirror of full correctness, read inside the TTS effect via a ref so it is
  // NOT an effect dependency (typing must not restart/clip speech).
  const isCurrentSentenceFullyCorrectRef = useRef(false)

  const resetTtsWordQueue = useCallback(() => {
    wordQueueIndexRef.current = 0
    if (wordQueueTimeoutRef.current) {
      clearTimeout(wordQueueTimeoutRef.current)
      wordQueueTimeoutRef.current = null
    }
  }, [])

  const skipWord = useCallback(() => {
    ttsSkipWordRef.current?.()
  }, [])

  const prevWord = useCallback(() => {
    ttsPrevWordRef.current?.()
  }, [])

  // Handle Text-To-Speech playback for custom text lessons
  useEffect(() => {
    if (!selectedLesson?.youtube_url?.startsWith('text://') || !sentences.length) return

    const synth = window.speechSynthesis
    if (!isPlaying) {
      // Mark cancellation as intentional so utterance.onerror doesn't set isPlaying=false
      ttsCancelledIntentionallyRef.current = true
      synth.cancel()
      ttsCancelPendingRef.current = true
      if (ttsSpeakTimeoutRef.current) {
        clearTimeout(ttsSpeakTimeoutRef.current)
        ttsSpeakTimeoutRef.current = null
      }
      if (intervalTimeoutRef.current && !isWaitingForPauseIntervalRef.current) {
        clearTimeout(intervalTimeoutRef.current)
        intervalTimeoutRef.current = null
      }
      if (wordQueueTimeoutRef.current) {
        clearTimeout(wordQueueTimeoutRef.current)
        wordQueueTimeoutRef.current = null
      }
      return
    }

    const currentSentence = sentences[currentSentenceIndex]
    if (!currentSentence) return

    if (isWaitingForPauseIntervalRef.current) {
      isWaitingForPauseIntervalRef.current = false
      if (intervalTimeoutRef.current) {
        clearTimeout(intervalTimeoutRef.current)
        intervalTimeoutRef.current = null
      }
    }

    // Resolve the voice object once
    let selectedVoice: SpeechSynthesisVoice | null = null
    if (ttsVoiceName && availableVoices.length) {
      selectedVoice = availableVoices.find(v => v.name === ttsVoiceName) || null
    }

    // Called when the entire sentence has finished (either whole-sentence or last word)
    const onSentenceFinished = () => {
      wordQueueIndexRef.current = 0
      const shouldRepeat =
        repeatCount === '∞'
          ? !isCurrentSentenceFullyCorrectRef.current
          : (typeof repeatCount === 'number' && repeatCountRef.current <= repeatCount - 1)

      if (pauseInterval > 0) {
        isWaitingForPauseIntervalRef.current = true
        if (intervalTimeoutRef.current) {
          clearTimeout(intervalTimeoutRef.current)
        }
        setIsPlaying(false)
        intervalTimeoutRef.current = setTimeout(() => {
          isWaitingForPauseIntervalRef.current = false
          intervalTimeoutRef.current = null
          if (shouldRepeat) {
            repeatCountRef.current++
            setIsPlaying(true)
          } else {
            repeatCountRef.current = 0
            if (currentSentenceIndex < sentences.length - 1) {
              setCurrentSentenceIndex((prev) => prev + 1)
              setIsPlaying(true)
            } else {
              setCurrentSentenceIndex(0)
              setIsPlaying(false)
            }
          }
        }, pauseInterval * 1000)
      } else {
        if (shouldRepeat) {
          repeatCountRef.current++
          // Re-trigger by toggling isPlaying (the effect will re-run)
          setIsPlaying(false)
          setTimeout(() => setIsPlaying(true), 10)
        } else {
          repeatCountRef.current = 0
          if (currentSentenceIndex < sentences.length - 1) {
            setCurrentSentenceIndex((prev) => prev + 1)
          } else {
            setCurrentSentenceIndex(0)
            setIsPlaying(false)
          }
        }
      }
    }

    // Speak an utterance without clipping its start. Two distinct browser quirks cause
    // clipping and need two different fixes:
    // 1) Chromium drops the very start of an utterance when speak() is called in the
    //    same tick as cancel(), so we only cancel when something is actually playing
    //    and, when we do, defer the speak by a tick.
    // 2) The speech engine's synthesis pipeline has its own warm-up latency and clips
    //    the start of whatever is first in the queue after being idle -- no amount of
    //    delay before calling speak() avoids this. So we queue a silent "primer"
    //    utterance immediately before the real one; the warm-up eats the primer
    //    instead of the sentence, since the two play back-to-back with no idle gap.
    const speakUtterance = (utterance: SpeechSynthesisUtterance) => {
      if (ttsSpeakTimeoutRef.current) {
        clearTimeout(ttsSpeakTimeoutRef.current)
        ttsSpeakTimeoutRef.current = null
      }
      const primeAndSpeak = () => {
        const primer = new SpeechSynthesisUtterance('.')
        primer.volume = 0
        primer.rate = utterance.rate
        if (utterance.voice) primer.voice = utterance.voice
        synth.speak(primer)
        synth.speak(utterance)
      }
      if (synth.speaking || synth.pending || ttsCancelPendingRef.current) {
        ttsCancelledIntentionallyRef.current = true
        synth.cancel()
        ttsCancelPendingRef.current = true
        ttsSpeakTimeoutRef.current = setTimeout(() => {
          ttsSpeakTimeoutRef.current = null
          ttsCancelledIntentionallyRef.current = false
          ttsCancelPendingRef.current = false
          primeAndSpeak()
        }, 10)
      } else {
        ttsCancelledIntentionallyRef.current = false
        primeAndSpeak()
      }
    }

    if (ttsWordByWord) {
      // --- Word-by-word mode ---
      const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)
      if (words.length === 0) { onSentenceFinished(); return }

      // Expand each token into speech segments so the Word Gap also separates a
      // word from its spoken punctuation: "Hello," -> "Hello" (gap) "comma" (gap).
      // Punctuation-name segments use half the base gap (typing them is one
      // keystroke); word segments keep the length-scaled gap.
      type TtsSegment = {
        text: string
        gapMultiplier: number
        tokenIdx: number
        lastOfToken: boolean
        isPunct: boolean
      }
      const segments: TtsSegment[] = []
      words.forEach((token, tokenIdx) => {
        const wordPart = token.replace(/[,.?!]/g, '').trim()
        const punctNames = (token.match(/[,.?!]/g) ?? []).map((ch) => SPOKEN_PUNCTUATION[ch])
        if (wordPart) {
          segments.push({
            text: wordPart,
            gapMultiplier: wordGapMultiplier(wordPart),
            tokenIdx,
            lastOfToken: punctNames.length === 0,
            isPunct: false,
          })
        }
        punctNames.forEach((name, i) => {
          segments.push({
            text: name,
            gapMultiplier: PUNCT_GAP_MULTIPLIER,
            tokenIdx,
            lastOfToken: i === punctNames.length - 1,
            isPunct: true,
          })
        })
      })
      if (segments.length === 0) { onSentenceFinished(); return }

      // Group N words into one phrase. The group is merged into a SINGLE
      // utterance so it is spoken naturally ("how are you"), not as separate
      // words with the engine's boundary between them. The pause that follows
      // accumulates every gap the group's words would each have earned.
      const groupSize = Math.max(1, Math.floor(ttsWordsPerGap || 1))
      if (groupSize > 1) {
        // Group by token, not segment, so a word and its punctuation stay together
        const groupOf = (tokenIdx: number) => Math.floor(tokenIdx / groupSize)
        const out: TtsSegment[] = []
        let i = 0
        while (i < segments.length) {
          const g = groupOf(segments[i].tokenIdx)
          const groupSegs: TtsSegment[] = []
          while (i < segments.length && groupOf(segments[i].tokenIdx) === g) {
            groupSegs.push(segments[i])
            i++
          }
          const totalGap = groupSegs.reduce((sum, s) => sum + s.gapMultiplier, 0)

          // Merge consecutive words into one phrase, but leave each punctuation
          // name standalone so it stays audibly separated from the words.
          const pieces: TtsSegment[] = []
          for (const seg of groupSegs) {
            const last = pieces[pieces.length - 1]
            if (!seg.isPunct && last && !last.isPunct) {
              last.text += ` ${seg.text}`
              // Track the furthest token so resume/skip continue after the run
              last.tokenIdx = seg.tokenIdx
            } else {
              pieces.push({ ...seg, lastOfToken: true })
            }
          }

          // Merging speaks faster than one word at a time because each utterance
          // carries its own trailing padding — hand that time back so a group
          // lasts as long as N=1 would.
          let extra = 0
          if (ttsWordInterval > 0) {
            const lostMs =
              ((groupSegs.length - pieces.length) * MERGED_UTTERANCE_PADDING_MS) /
              Math.max(0.1, playbackSpeed)
            extra = lostMs / (ttsWordInterval * 1500)
          }

          // Keep a small gap at each internal (punctuation) boundary; the rest
          // of the group's accumulated time lands after the final piece.
          const internal = Math.max(0, pieces.length - 1) * PUNCT_GAP_MULTIPLIER
          pieces.forEach((piece, idx) => {
            piece.gapMultiplier =
              idx < pieces.length - 1
                ? PUNCT_GAP_MULTIPLIER
                : Math.max(0, totalGap + extra - internal)
          })
          out.push(...pieces)
        }
        segments.length = 0
        segments.push(...out)
      }

      // Utterances abandoned by Skip: their late onend must not schedule anything
      const abandonedUtterances = new WeakSet<SpeechSynthesisUtterance>()
      let currentSegIdx = -1
      let currentUtterance: SpeechSynthesisUtterance | null = null

      // How many times each unit is spoken before moving on (1 = say it once).
      // The unit is the whole group, so with Words/Gap > 1 the entire phrase —
      // punctuation included — repeats as one piece rather than each word
      // repeating on its own.
      const wordRepeats = Math.max(1, Math.min(5, Math.floor(ttsWordRepeat || 1)))
      const groupIdOf = segments.map((seg) => Math.floor(seg.tokenIdx / groupSize))
      const groupFirstSeg = new Map<number, number>()
      groupIdOf.forEach((gid, i) => {
        if (!groupFirstSeg.has(gid)) groupFirstSeg.set(gid, i)
      })

      const speakSegment = (segIdx: number, pass = 1) => {
        if (segIdx >= segments.length) {
          onSentenceFinished()
          return
        }
        const segment = segments[segIdx]
        const utterance = new SpeechSynthesisUtterance(segment.text)
        utterance.rate = playbackSpeed
        if (selectedVoice) utterance.voice = selectedVoice
        currentSegIdx = segIdx
        currentUtterance = utterance

        utterance.onend = () => {
          if (abandonedUtterances.has(utterance)) return
          const gapMs = ttsWordInterval * 1500 * segment.gapMultiplier
          const groupId = groupIdOf[segIdx]
          const isLastOfGroup =
            segIdx + 1 >= segments.length || groupIdOf[segIdx + 1] !== groupId
          // At the end of a group, replay it from its first segment until the
          // requested number of passes is done — with the same gap in between,
          // so there is typing time on every pass.
          if (isLastOfGroup && pass < wordRepeats) {
            wordQueueTimeoutRef.current = setTimeout(() => {
              wordQueueTimeoutRef.current = null
              speakSegment(groupFirstSeg.get(groupId) ?? segIdx, pass + 1)
            }, gapMs)
            return
          }
          // Resume position is tracked at token granularity
          if (segment.lastOfToken) wordQueueIndexRef.current = segment.tokenIdx + 1
          if (segIdx + 1 < segments.length) {
            // Wait for the word interval before the next segment, scaled up for
            // longer words so there's enough time to type them. Carry the pass
            // number within a group; reset it when crossing into the next one.
            wordQueueTimeoutRef.current = setTimeout(() => {
              wordQueueTimeoutRef.current = null
              speakSegment(segIdx + 1, isLastOfGroup ? 1 : pass)
            }, gapMs)
          } else {
            onSentenceFinished()
          }
        }

        utterance.onerror = (e) => {
          // Ignore 'interrupted' and 'canceled' errors from intentional synth.cancel()
          if (abandonedUtterances.has(utterance)) return
          if (ttsCancelledIntentionallyRef.current) return
          if (e instanceof SpeechSynthesisErrorEvent && (e.error === 'interrupted' || e.error === 'canceled')) return
          setIsPlaying(false)
        }

        speakUtterance(utterance)
      }

      // Skip the rest of the current word — cut off its speech, drop the
      // remaining gap and any pending punctuation names — and jump straight
      // to the next word. The skipped word's input is left as-is.
      ttsSkipWordRef.current = () => {
        if (currentSegIdx < 0) return
        const tokenIdx = segments[currentSegIdx].tokenIdx
        if (currentUtterance) abandonedUtterances.add(currentUtterance)
        if (wordQueueTimeoutRef.current) {
          clearTimeout(wordQueueTimeoutRef.current)
          wordQueueTimeoutRef.current = null
        }
        wordQueueIndexRef.current = tokenIdx + 1
        let next = currentSegIdx + 1
        while (next < segments.length && segments[next].tokenIdx === tokenIdx) next++
        if (next < segments.length) {
          speakSegment(next)
        } else {
          ttsCancelledIntentionallyRef.current = true
          synth.cancel()
          onSentenceFinished()
        }
      }

      // Go back to the previous word: cut off the current speech and restart
      // from the first segment of the preceding token. On the first word it
      // simply replays that word from its start.
      ttsPrevWordRef.current = () => {
        if (currentSegIdx < 0) return
        const tokenIdx = segments[currentSegIdx].tokenIdx
        if (currentUtterance) abandonedUtterances.add(currentUtterance)
        if (wordQueueTimeoutRef.current) {
          clearTimeout(wordQueueTimeoutRef.current)
          wordQueueTimeoutRef.current = null
        }
        // First segment of the current token; if we are already there, step to
        // the token before it so a mid-word press does not just restart it.
        let start = currentSegIdx
        while (start > 0 && segments[start - 1].tokenIdx === tokenIdx) start--
        if (start === currentSegIdx && start > 0) {
          const prevTokenIdx = segments[start - 1].tokenIdx
          start--
          while (start > 0 && segments[start - 1].tokenIdx === prevTokenIdx) start--
        }
        wordQueueIndexRef.current = segments[start].tokenIdx
        speakSegment(start)
      }

      if (!isWaitingForPauseIntervalRef.current) {
        // Resume from the first segment of the saved token (0 after a reset)
        const startToken = wordQueueIndexRef.current
        const startSeg = segments.findIndex((s) => s.tokenIdx >= startToken)
        if (startSeg === -1) {
          onSentenceFinished()
        } else {
          speakSegment(startSeg)
        }
      }
    } else {
      // --- Whole-sentence mode (original) ---
      const speak = () => {
        const utterance = new SpeechSynthesisUtterance(currentSentence.sentence_text)
        utterance.rate = playbackSpeed
        if (selectedVoice) utterance.voice = selectedVoice

        utterance.onend = () => {
          onSentenceFinished()
        }

        utterance.onerror = (e) => {
          // Ignore 'interrupted' and 'canceled' errors from intentional synth.cancel()
          if (ttsCancelledIntentionallyRef.current) return
          if (e instanceof SpeechSynthesisErrorEvent && (e.error === 'interrupted' || e.error === 'canceled')) return
          setIsPlaying(false)
        }

        speakUtterance(utterance)
      }

      if (!isWaitingForPauseIntervalRef.current) {
        speak()
      }
    }

    return () => {
      ttsSkipWordRef.current = null
      ttsPrevWordRef.current = null
      // Mark as intentional so the cancelled utterance's onerror doesn't kill playback
      ttsCancelledIntentionallyRef.current = true
      synth.cancel()
      ttsCancelPendingRef.current = true
      if (ttsSpeakTimeoutRef.current) {
        clearTimeout(ttsSpeakTimeoutRef.current)
        ttsSpeakTimeoutRef.current = null
      }
      if (wordQueueTimeoutRef.current) {
        clearTimeout(wordQueueTimeoutRef.current)
        wordQueueTimeoutRef.current = null
      }
    }
  }, [
    isPlaying,
    currentSentenceIndex,
    sentences,
    selectedLesson,
    playbackSpeed,
    repeatCount,
    pauseInterval,
    ttsVoiceName,
    availableVoices,
    ttsWordByWord,
    ttsWordInterval,
    ttsWordsPerGap,
    ttsWordRepeat,
  ])

  return { resetTtsWordQueue, skipWord, prevWord, isCurrentSentenceFullyCorrectRef }
}
