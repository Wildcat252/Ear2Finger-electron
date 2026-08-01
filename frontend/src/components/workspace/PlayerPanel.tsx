import type { MutableRefObject } from 'react'
import { useWorkspace, type Sentence } from '../../contexts/WorkspaceContext'
import { displayKey, type Keybindings } from '../../keybindings'

const SPEED_OPTIONS = [0.2, 0.4, 0.6, 0.8, 1, 1.2]
// How many times each word is spoken in word-by-word mode
const WORD_REPEAT_OPTIONS = [1, 2, 3, 4, 5]

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

interface PlayerPanelProps {
  audioRef: MutableRefObject<HTMLAudioElement | null>
  audioBlobUrl: string | null
  currentSentence: Sentence | null
  /** Refs shared with the TTS engine / audio-playback effects */
  intervalTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  isWaitingForPauseIntervalRef: MutableRefObject<boolean>
  repeatCountRef: MutableRefObject<number>
  userInitiatedSentenceChangeRef: MutableRefObject<boolean>
  programmaticSeekRef: MutableRefObject<boolean>
  wordInputRefs: MutableRefObject<(HTMLInputElement | null)[]>
  resetTtsWordQueue: () => void
  ttsSkipWord: () => void
  ttsPrevWord: () => void
  isPunctuationOnlyToken: (token: string) => boolean
  keybinds: Keybindings
  onAskCoach: (videoId: number) => void
}

/**
 * Top panel of the workspace: lesson title, the hidden <audio> element,
 * transport controls with the progress bar, and the settings/score row.
 */
export function PlayerPanel({
  audioRef,
  audioBlobUrl,
  currentSentence,
  intervalTimeoutRef,
  isWaitingForPauseIntervalRef,
  repeatCountRef,
  userInitiatedSentenceChangeRef,
  programmaticSeekRef,
  wordInputRefs,
  resetTtsWordQueue,
  ttsSkipWord,
  ttsPrevWord,
  isPunctuationOnlyToken,
  keybinds,
  onAskCoach,
}: PlayerPanelProps) {
  const {
    selectedLesson,
    sentences,
    currentSentenceIndex,
    setCurrentSentenceIndex,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    playbackSpeed,
    setPlaybackSpeed,
    ttsWordByWord,
    setTtsWordByWord,
    ttsWordInterval,
    setTtsWordInterval,
    ttsWordsPerGap,
    setTtsWordsPerGap,
    ttsWordRepeat,
    setTtsWordRepeat,
    videoSessionScores,
  } = useWorkspace()

  const isTextLesson = Boolean(selectedLesson?.youtube_url?.startsWith('text://'))
  const totalDuration = selectedLesson?.duration || 0
  const sentenceCount = sentences.length

  return (
    <div className="w-full max-w-4xl mx-auto shrink-0 bg-white rounded-xl border border-gray-200 p-3 md:p-4">
      <div className="mb-3 md:mb-4 text-center">
        <h1 className="text-lg md:text-xl font-semibold text-gray-900 text-center line-clamp-2">
          {selectedLesson?.title || 'Select a lesson'}
        </h1>
      </div>

      {/* Audio Element (hidden) */}
      {selectedLesson && (
        <audio
          ref={audioRef}
          src={audioBlobUrl ?? undefined}
          onLoadedMetadata={() => {
            if (audioRef.current != null && currentTime >= 0) {
              audioRef.current.currentTime = currentTime
            }
          }}
          onEnded={() => {
            setIsPlaying(false)
          }}
          onError={(e) => {
            console.error('Audio playback error:', e)
            setIsPlaying(false)
          }}
        />
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4 mb-3 md:mb-4">
        {/* Media Player */}
        <div className="flex-1 flex items-center gap-2 min-w-0 w-full">
          <button
            onClick={() => {
              if (currentSentenceIndex > 0) {
                userInitiatedSentenceChangeRef.current = true
                const prevIndex = currentSentenceIndex - 1
                setCurrentSentenceIndex(prevIndex)
                repeatCountRef.current = 0
                resetTtsWordQueue()
                if (isTextLesson) {
                  setCurrentTime(sentences[prevIndex].start_time)
                } else if (audioRef.current && sentences[prevIndex]) {
                  audioRef.current.currentTime = sentences[prevIndex].start_time
                  setCurrentTime(sentences[prevIndex].start_time)
                }
              }
            }}
            disabled={currentSentenceIndex === 0}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (!selectedLesson || !sentences.length) return
              setIsPlaying(!isPlaying)
              // When the user hits Play, move the cursor to the first input-able word (skip punctuation-only tokens).
              if (currentSentence) {
                const words = currentSentence.sentence_text.split(/\s+/).filter(Boolean)
                const firstInputIndex = words.findIndex((w) => !isPunctuationOnlyToken(w))
                if (firstInputIndex >= 0) {
                  wordInputRefs.current[firstInputIndex]?.focus()
                }
              }
            }}
            disabled={!selectedLesson || !sentences.length}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? (
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              if (!selectedLesson || !sentences.length || !currentSentence) return
              // Reset word queue so TTS restarts from word 0
              resetTtsWordQueue()
              repeatCountRef.current = 0
              if (isTextLesson) {
                // Cancel current speech, then re-trigger by toggling isPlaying
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
            }}
            disabled={!selectedLesson || !sentences.length}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            title="Replay current sentence"
          >
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311V15a.75.75 0 01-1.5 0v-3.5a.75.75 0 01.75-.75H8.5a.75.75 0 010 1.5H7.058l.162.162a4 4 0 006.693-1.793.75.75 0 011.399.555zM4.688 8.576a5.5 5.5 0 019.201-2.466l.312.311V5a.75.75 0 011.5 0v3.5a.75.75 0 01-.75.75H11.5a.75.75 0 010-1.5h1.442l-.162-.162a4 4 0 00-6.693 1.793.75.75 0 11-1.399-.555z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (currentSentenceIndex >= sentences.length - 1) return
              const nextIndex = currentSentenceIndex + 1
              const nextSentence = sentences[nextIndex]
              if (!nextSentence) return
              userInitiatedSentenceChangeRef.current = true
              // Cancel any pause-interval timeout so it doesn't fire after we skip
              if (intervalTimeoutRef.current) {
                clearTimeout(intervalTimeoutRef.current)
                intervalTimeoutRef.current = null
              }
              isWaitingForPauseIntervalRef.current = false
              repeatCountRef.current = 0
              resetTtsWordQueue()
              setCurrentSentenceIndex(nextIndex)
              setCurrentTime(nextSentence.start_time)
              if (isTextLesson) {
                setCurrentTime(nextSentence.start_time)
              } else if (audioRef.current) {
                audioRef.current.currentTime = nextSentence.start_time
                audioRef.current.play().catch(() => { })
              }
              setIsPlaying(true)
            }}
            disabled={currentSentenceIndex >= sentences.length - 1}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0011 6v2.798l-5.445-3.63z" />
            </svg>
          </button>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div
              className="flex-1 min-w-0 h-2 rounded-full overflow-hidden relative pointer-events-none"
              aria-hidden
            >
              <div className="absolute inset-0 bg-gray-200 rounded-full" />
              <div
                className="absolute inset-y-0 left-0 bg-indigo-600 rounded-full origin-left"
                style={{
                  width: `${isTextLesson
                    ? sentences.length > 0
                      ? Math.min(100, ((currentSentenceIndex + 1) / sentences.length) * 100)
                      : 0
                    : totalDuration > 0
                      ? Math.min(100, (currentTime / totalDuration) * 100)
                      : 0
                    }%`,
                  transition: 'width 0.2s linear'
                }}
              />
            </div>
            <span className="text-sm text-gray-600 min-w-[3rem]">
              {isTextLesson ? (
                <span className="text-gray-500 bg-gray-200 text-xs rounded-full px-2 py-1">
                  Sentence {currentSentenceIndex + 1} / {sentences.length}
                </span>
              ) : (
                <>
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                  {sentenceCount > 0 && (
                    <span className="ml-2 text-gray-500 bg-gray-200 text-xs rounded-full px-2 py-1">
                      {currentSentenceIndex + 1} / {sentenceCount}
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="relative group">
          <div className="bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs cursor-pointer">
            <span>Speed: {playbackSpeed}x</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg text-gray-900 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`w-full text-left px-4 py-2 text-xs text-gray-900 hover:bg-gray-100 ${playbackSpeed === speed ? 'bg-gray-100 font-semibold' : ''
                  }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
        {isTextLesson && (
          <div
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs cursor-pointer transition-colors ${ttsWordByWord
              ? 'bg-blue-600 text-white'
              : 'bg-gray-900 text-white'
              }`}
            onClick={() => {
              // Reset word queue before toggling so the effect re-enters cleanly
              resetTtsWordQueue()
              setTtsWordByWord(!ttsWordByWord)
            }}
          >
            <span>Word-by-Word: {ttsWordByWord ? 'ON' : 'OFF'}</span>
          </div>
        )}
        {isTextLesson && ttsWordByWord && (
          <div className="bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs">
            <span>Word Gap:</span>
            <input
              key={ttsWordInterval}
              type="number"
              defaultValue={ttsWordInterval}
              min={0}
              max={10}
              step={0.05}
              title="Seconds between spoken words (0–10)"
              onKeyDown={(e) => {
                // Keep keystrokes local so global shortcuts (-, =, Enter…) don't fire
                e.stopPropagation()
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              onBlur={(e) => {
                const v = parseFloat(e.currentTarget.value)
                if (Number.isFinite(v)) {
                  setTtsWordInterval(Math.min(10, Math.max(0, v)))
                } else {
                  e.currentTarget.value = String(ttsWordInterval)
                }
              }}
              className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-gray-500"
            />
            <span>s</span>
          </div>
        )}
        {isTextLesson && ttsWordByWord && (
          <div className="bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs">
            <span>Words/Gap:</span>
            <input
              key={ttsWordsPerGap}
              type="number"
              defaultValue={ttsWordsPerGap}
              min={1}
              max={20}
              step={1}
              title="Speak this many words before pausing (1–20). The pause adds up their gaps."
              onKeyDown={(e) => {
                // Keep keystrokes local so global shortcuts (-, =, Enter…) don't fire
                e.stopPropagation()
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              onBlur={(e) => {
                const v = parseInt(e.currentTarget.value, 10)
                if (Number.isFinite(v)) {
                  setTtsWordsPerGap(Math.min(20, Math.max(1, v)))
                } else {
                  e.currentTarget.value = String(ttsWordsPerGap)
                }
              }}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-gray-500"
            />
          </div>
        )}
        {isTextLesson && ttsWordByWord && (
          <div className="relative group">
            <div className="bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs cursor-pointer">
              <span>Repeat word: {ttsWordRepeat}x</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg text-gray-900 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
              {WORD_REPEAT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setTtsWordRepeat(n)}
                  className={`w-full text-left px-4 py-2 text-xs text-gray-900 hover:bg-gray-100 ${ttsWordRepeat === n ? 'bg-gray-100 font-semibold' : ''
                    }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
        )}
        {isTextLesson && ttsWordByWord && (
          <button
            type="button"
            onClick={() => ttsPrevWord()}
            title={`Go back to the previous word (${displayKey(keybinds.prevWord)})`}
            className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-gray-800 transition-colors"
          >
            ⏮ Prev
          </button>
        )}
        {isTextLesson && ttsWordByWord && (
          <button
            type="button"
            onClick={() => ttsSkipWord()}
            title={`Skip the current word and jump to the next one (${displayKey(keybinds.skipWord)})`}
            className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-gray-800 transition-colors"
          >
            Skip ⏭
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:ml-auto justify-end">
          <div className="flex items-center gap-1" title="Correct keystrokes in this video">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span className="text-sm text-gray-700">{videoSessionScores.correctChars}</span>
          </div>
          <div className="flex items-center gap-1" title="Hints used in this video">
            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
            <span className="text-sm text-gray-700">{videoSessionScores.hintCount}</span>
          </div>
          <div className="flex items-center gap-1" title="Incorrect keystrokes in this video">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <span className="text-sm text-gray-700">{videoSessionScores.incorrectChars}</span>
          </div>
          {selectedLesson && (
            <button
              type="button"
              onClick={() => onAskCoach(selectedLesson.video_id)}
              className="ml-4 inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
            >
              Ask coach
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
