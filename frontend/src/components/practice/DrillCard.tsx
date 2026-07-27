import type { MutableRefObject } from 'react'

const SPEED_OPTIONS = [0.2, 0.4, 0.6, 0.8, 1, 1.2]

interface DrillCardProps {
  index: number
  words: { length: number }
  target: string
  value: string
  isCorrect: boolean
  hintShown: boolean
  underlineClass: string
  playbackSpeed: number
  inputRef: MutableRefObject<HTMLInputElement | null>
  translationVisible: boolean
  translationLoading: boolean
  translationError: string | null
  translation: string | null
  handleChange: (next: string) => void
  setHintShown: (fn: (h: boolean) => boolean) => void
  speak: (text: string) => void
  spell: () => void
  toggleTranslation: () => void
  stepSpeed: (direction: 1 | -1) => void
  goTo: (index: number) => void
  goRandom: () => void
}

/** The listen-and-type drill: replay/spell/hint/translate, input, and nav. */
export function DrillCard({
  index,
  words,
  target,
  value,
  isCorrect,
  hintShown,
  underlineClass,
  playbackSpeed,
  inputRef,
  translationVisible,
  translationLoading,
  translationError,
  translation,
  handleChange,
  setHintShown,
  speak,
  spell,
  toggleTranslation,
  stepSpeed,
  goTo,
  goRandom,
}: DrillCardProps) {
  return (
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
    </>
  )
}
