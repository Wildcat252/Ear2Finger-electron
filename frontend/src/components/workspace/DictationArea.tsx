import { useEffect, useRef, type MutableRefObject } from 'react'
import { useWorkspace, type Sentence } from '../../contexts/WorkspaceContext'
import { displayKey, type Keybindings } from '../../keybindings'
import { playMistakeBuzz, type AudioSettings } from '../../audio'

interface InputFeedback {
  wordIndex: number
  type: 'correct' | 'wrong'
}

/**
 * Per-word dictation inputs: typing feedback, hint reveal and word navigation.
 *
 * normalizeWord / isPunctuationOnlyToken and wordInputRefs are owned by
 * Workspace (its correctness check and Play button need them too) and passed in.
 */
export function DictationArea({
  currentSentence,
  isCurrentSentenceFullyCorrect,
  wordInputRefs,
  normalizeWord,
  isPunctuationOnlyToken,
  audio,
  errorBuzzOptions,
  lastInputFeedback,
  setLastInputFeedback,
  keybinds,
  translateLanguages,
  translateLang,
  onChangeTranslateLang,
  translationVisible,
  translationLoading,
  translationError,
  translation,
  onToggleTranslation,
}: {
  currentSentence: Sentence | null
  isCurrentSentenceFullyCorrect: boolean
  wordInputRefs: MutableRefObject<(HTMLInputElement | null)[]>
  normalizeWord: (w: string) => string
  isPunctuationOnlyToken: (token: string) => boolean
  audio: AudioSettings
  errorBuzzOptions: Parameters<typeof playMistakeBuzz>[0]
  lastInputFeedback: InputFeedback | null
  setLastInputFeedback: (v: InputFeedback | null) => void
  keybinds: Keybindings
  translateLanguages: { code: string; label: string }[]
  translateLang: string
  onChangeTranslateLang: (lang: string) => void
  translationVisible: boolean
  translationLoading: boolean
  translationError: string | null
  translation: string | null
  onToggleTranslation: () => void
}) {
  const {
    currentSentenceIndex,
    wordInputs,
    setWordInputs,
    wordHintIndex,
    setWordHintIndex,
    setWordHintUsed,
    setWordErrorChars,
    setVideoSessionScores,
  } = useWorkspace()

  const prevSentenceKeyRef = useRef<number | null>(null)

  const focusNextInputableWord = (words: string[], fromIdx: number) => {
    let nextIndex = fromIdx + 1
    while (nextIndex < words.length && isPunctuationOnlyToken(words[nextIndex])) {
      nextIndex++
    }
    if (nextIndex < words.length) {
      wordInputRefs.current[nextIndex]?.focus()
    }
  }

  const handleMobileHintClick = () => {
    if (!currentSentence || isCurrentSentenceFullyCorrect) return
    const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)

    let focusedIdx: number | null = null
    for (let idx = 0; idx < words.length; idx++) {
      const el = wordInputRefs.current[idx]
      if (el && document.activeElement === el) {
        focusedIdx = idx
        break
      }
    }

    let targetIdx: number | null = focusedIdx
    if (targetIdx === null) {
      for (let idx = 0; idx < words.length; idx++) {
        if (isPunctuationOnlyToken(words[idx])) continue
        const w = words[idx]
        const currentVal = wordInputs[idx] ?? ''
        const wordComplete = normalizeWord(currentVal) === normalizeWord(w)
        if (!wordComplete) {
          targetIdx = idx
          break
        }
      }
    }

    if (targetIdx === null) return
    const word = words[targetIdx]
    if (isPunctuationOnlyToken(word)) return

    if (wordHintIndex === targetIdx) {
      setWordHintIndex(null)
      focusNextInputableWord(words, targetIdx)
      return
    }

    const currentVal = wordInputs[targetIdx] ?? ''
    const wordComplete = normalizeWord(currentVal) === normalizeWord(word)
    if (wordComplete) {
      focusNextInputableWord(words, targetIdx)
    } else {
      const ti = targetIdx
      setWordHintIndex(ti)
      setVideoSessionScores((s) => ({ ...s, hintCount: s.hintCount + 1 }))
      setWordHintUsed((prev) => {
        const next = [...prev]
        while (next.length <= ti) next.push(false)
        next[ti] = true
        return next
      })
      wordInputRefs.current[ti]?.focus()
    }
  }
  // Reset per-word inputs and hint when current sentence changes. Skip on initial mount to preserve restored progress.
  useEffect(() => {
    if (!currentSentence) {
      prevSentenceKeyRef.current = null
      setWordInputs([])
      setWordHintIndex(null)
      setWordHintUsed([])
      setWordErrorChars([])
      return
    }
    const key = currentSentence.id
    if (prevSentenceKeyRef.current !== null && prevSentenceKeyRef.current !== key) {
      const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)
      setWordInputs(words.map(() => ''))
      setWordHintIndex(null)
      setWordHintUsed(words.map(() => false))
      setWordErrorChars(words.map(() => 0))
      wordInputRefs.current = []
    }
    prevSentenceKeyRef.current = key
  }, [currentSentenceIndex, currentSentence?.id])

  // When switching to a new sentence, focus the first input-able word (skip punctuation-only tokens).
  useEffect(() => {
    if (!currentSentence) return
    const t1 = setTimeout(() => {
      const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)
      const firstInputIndex = words.findIndex((w) => !isPunctuationOnlyToken(w))
      if (firstInputIndex >= 0) {
        wordInputRefs.current[firstInputIndex]?.focus()
      }
    }, 0)
    const t2 = setTimeout(() => {
      const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)
      const firstInputIndex = words.findIndex((w) => !isPunctuationOnlyToken(w))
      if (firstInputIndex >= 0) {
        wordInputRefs.current[firstInputIndex]?.focus()
      }
    }, 100)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [currentSentenceIndex, currentSentence?.id])

  const getWordUnderlineClass = (targetWord: string, inputValue: string) => {
    if (inputValue.length === 0) return 'border-b-2 border-gray-300'
    const target = normalizeWord(targetWord)
    const input = normalizeWord(inputValue)
    for (let i = 0; i < input.length; i++) {
      if (i >= target.length || input[i] !== target[i]) return 'border-b-4 border-red-500'
    }
    if (input.length < target.length) return 'border-b-4 border-yellow-500'
    return 'border-b-4 border-green-500'
  }

  return (
    <>
          {/* Text Input Panel - Per-word input */}
          <div className="flex-1 w-full max-w-4xl mx-auto overflow-y-auto min-h-0 bg-white rounded-xl border border-gray-200 p-3 md:p-4">
            {currentSentence ? (() => {
              const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)
              return (
                <div className="w-full min-w-0">
                  <div className="h-6 md:h-8 flex items-center mt-1 mb-0 md:mt-3 md:mb-1">
                    <p
                      className={`inline-flex items-center gap-1 text-lg md:text-xl font-semibold transition-opacity ${isCurrentSentenceFullyCorrect
                        ? 'text-green-600 opacity-100'
                        : 'text-transparent opacity-0'
                        }`}
                    >
                      <span className="text-lg md:text-xl">✔</span>
                      <span>Correct</span>
                    </p>
                  </div>
                  <div className="-mt-1 mb-3 md:hidden">
                    <button
                      type="button"
                      onClick={handleMobileHintClick}
                      disabled={Boolean(isCurrentSentenceFullyCorrect)}
                      title="Reveal the current word (same as Tab)"
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                      Hint
                    </button>
                  </div>
                  <div className="text-lg md:text-xl leading-relaxed text-gray-900 flex flex-wrap items-baseline gap-x-1.5 gap-y-2 md:gap-x-2 md:gap-y-3">
                    {words.map((word, idx) => {
                      if (isPunctuationOnlyToken(word)) {
                        return (
                          <span key={idx} className="inline-flex items-baseline">
                            <span
                              className="text-gray-500"
                              style={{ fontSize: '1.8em' }}
                            >
                              {word}
                            </span>
                            {idx < words.length - 1 ? '\u00A0' : null}
                          </span>
                        )
                      }
                      const isHintShown = wordHintIndex === idx
                      const value = isHintShown ? word : (wordInputs[idx] ?? '')
                      const underlineClass = getWordUnderlineClass(word, value)
                      return (
                        <span key={idx} className="inline-flex items-baseline">
                          <input
                            ref={(el) => {
                              if (!wordInputRefs.current) wordInputRefs.current = []
                              wordInputRefs.current[idx] = el
                            }}
                            type="text"
                            disabled={Boolean(isCurrentSentenceFullyCorrect)}
                            value={value}
                            onChange={(e) => {
                              const v = e.target.value
                              const prev = wordInputs[idx] ?? ''
                              // Count a wrong character event when the normalized prefix first diverges
                              if (v.length > prev.length) {
                                const targetNorm = normalizeWord(word)
                                const prevNorm = normalizeWord(prev)
                                const nextNorm = normalizeWord(v)
                                const prevOk = targetNorm.startsWith(prevNorm)
                                const nextOk = targetNorm.startsWith(nextNorm)
                                if (prevOk && !nextOk) {
                                  setWordErrorChars((prevArr) => {
                                    const nextArr = [...prevArr]
                                    while (nextArr.length <= idx) nextArr.push(0)
                                    nextArr[idx] = (nextArr[idx] ?? 0) + 1
                                    return nextArr
                                  })
                                  setVideoSessionScores((s) => ({ ...s, incorrectChars: s.incorrectChars + 1 }))
                                  setLastInputFeedback({ wordIndex: idx, type: 'wrong' })
                                  if (audio.errorEnabled) playMistakeBuzz(errorBuzzOptions)
                                } else if (prevOk && nextOk) {
                                  setVideoSessionScores((s) => ({ ...s, correctChars: s.correctChars + 1 }))
                                  setLastInputFeedback({ wordIndex: idx, type: 'correct' })
                                }
                              }
                              if (isHintShown) {
                                setWordHintIndex(null)
                                setWordInputs((prev) => {
                                  const next = [...prev]
                                  while (next.length <= idx) next.push('')
                                  next[idx] = v
                                  return next
                                })
                                return
                              }
                              setWordInputs((prev) => {
                                const next = [...prev]
                                while (next.length <= idx) next.push('')
                                next[idx] = v
                                return next
                              })
                            }}
                            onKeyDown={(e) => {
                              // If a hint is currently shown for this word and the user presses Backspace,
                              // clear the hint and underlying value so the input becomes empty.
                              if (e.key === 'Backspace' && isHintShown) {
                                e.preventDefault()
                                setWordHintIndex(null)
                                setWordInputs((prev) => {
                                  const next = [...prev]
                                  while (next.length <= idx) next.push('')
                                  next[idx] = ''
                                  return next
                                })
                                return
                              }
                              if (e.key === 'Backspace' && value.length === 0 && idx > 0) {
                                e.preventDefault()
                                wordInputRefs.current[idx - 1]?.focus()
                                return
                              }
                              if (e.key === ' ' && e.shiftKey) {
                                e.preventDefault()
                                // Move to the previous input-able word (skip punctuation-only tokens)
                                let prevIndex = idx - 1
                                while (prevIndex >= 0 && isPunctuationOnlyToken(words[prevIndex])) {
                                  prevIndex--
                                }
                                if (prevIndex >= 0) {
                                  wordInputRefs.current[prevIndex]?.focus()
                                }
                                return
                              }
                              if (e.key === ' ') {
                                e.preventDefault()
                                // Move to the next input-able word (skip punctuation-only tokens)
                                let nextIndex = idx + 1
                                while (nextIndex < words.length && isPunctuationOnlyToken(words[nextIndex])) {
                                  nextIndex++
                                }
                                if (nextIndex < words.length) {
                                  wordInputRefs.current[nextIndex]?.focus()
                                }
                                return
                              }
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                if (wordHintIndex === idx) {
                                  // Close the hint only — keep the cursor here so the
                                  // learner can type the word they just peeked at
                                  setWordHintIndex(null)
                                } else {
                                  const currentVal = wordInputs[idx] ?? ''
                                  const wordComplete = normalizeWord(currentVal) === normalizeWord(word)
                                  if (wordComplete) {
                                    wordInputRefs.current[idx + 1]?.focus()
                                  } else {
                                    setWordHintIndex(idx)
                                    setVideoSessionScores((s) => ({ ...s, hintCount: s.hintCount + 1 }))
                                    setWordHintUsed((prev) => {
                                      const next = [...prev]
                                      while (next.length <= idx) next.push(false)
                                      next[idx] = true
                                      return next
                                    })
                                  }
                                }
                                return
                              }
                              if (wordHintIndex === idx && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                e.preventDefault()
                                const targetNorm = normalizeWord(word)
                                const keyNorm = normalizeWord(e.key)
                                const isCorrectFirstChar = targetNorm.length > 0 && targetNorm[0] === keyNorm[0]
                                setVideoSessionScores((s) =>
                                  isCorrectFirstChar
                                    ? { ...s, correctChars: s.correctChars + 1 }
                                    : { ...s, incorrectChars: s.incorrectChars + 1 }
                                )
                                setLastInputFeedback({
                                  wordIndex: idx,
                                  type: isCorrectFirstChar ? 'correct' : 'wrong',
                                })
                                if (!isCorrectFirstChar && audio.errorEnabled) playMistakeBuzz(errorBuzzOptions)
                                setWordHintIndex(null)
                                setWordInputs((prev) => {
                                  const next = [...prev]
                                  while (next.length <= idx) next.push('')
                                  next[idx] = e.key
                                  return next
                                })
                              }
                            }}
                            className={`bg-transparent border-0 outline-none px-0.5 py-0 min-w-0 rounded-sm focus:shadow-[0_0_0_2px_rgba(251,191,36,0.5)] ${underlineClass} ${isHintShown ? 'text-gray-400' : 'text-gray-900'} ${lastInputFeedback?.wordIndex === idx && lastInputFeedback?.type === 'correct'
                              ? 'input-feedback-correct'
                              : lastInputFeedback?.wordIndex === idx && lastInputFeedback?.type === 'wrong'
                                ? 'input-feedback-wrong'
                                : ''
                              }`}
                            style={{
                              maxWidth: `${Math.max(2, word.length * 1.2)}ch`,
                              fontSize: 'clamp(1.05rem, 4.2vw, 2.25rem)',
                            }}
                            aria-label={`Word ${idx + 1}`}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          {idx < words.length - 1 ? '\u00A0' : null}
                        </span>
                      )
                    })}
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={onToggleTranslation}
                      title={`Translate this sentence (${displayKey(keybinds.translate)})`}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${translationVisible
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      Translate
                    </button>
                    <select
                      value={translateLang}
                      onChange={(e) => onChangeTranslateLang(e.target.value)}
                      title="Translation language"
                      className="ml-2 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
                    >
                      {translateLanguages.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                    {translationVisible && (
                      <div className="mt-2 text-sm md:text-base text-gray-600 italic">
                        {translationLoading && <span>Translating\u2026</span>}
                        {translationError && <span className="text-red-600 not-italic">{translationError}</span>}
                        {translation && !translationLoading && !translationError && <span>{translation}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })() : (
              <div className="text-center text-gray-500 py-12">
                Select a lesson to start practicing
              </div>
            )}
          </div>
    </>
  )
}
