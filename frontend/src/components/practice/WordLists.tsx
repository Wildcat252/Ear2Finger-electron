import type { WordStat } from '../../api'

interface WordListsProps {
  words: WordStat[]
  binList: WordStat[]
  pageWords: WordStat[]
  page: number
  pageCount: number
  setPage: (fn: (p: number) => number) => void
  index: number
  tableVisible: boolean
  setTableVisible: (fn: (v: boolean) => boolean) => void
  binVisible: boolean
  setBinVisible: (fn: (v: boolean) => boolean) => void
  deleting: string | null
  bulkBusy: boolean
  goTo: (index: number) => void
  handleBin: (word: string) => void
  handleRecover: (word: string) => void
  handleDeleteForever: (word: string) => void
  handleRecoverAll: () => void
  handleDeleteAllForever: () => void
  displayOf: (word: string) => string
}

/** The tricky-words table and the recoverable word bin below the drill. */
export function WordLists({
  words,
  binList,
  pageWords,
  page,
  pageCount,
  setPage,
  index,
  tableVisible,
  setTableVisible,
  binVisible,
  setBinVisible,
  deleting,
  bulkBusy,
  goTo,
  handleBin,
  handleRecover,
  handleDeleteForever,
  handleRecoverAll,
  handleDeleteAllForever,
  displayOf,
}: WordListsProps) {
  return (
    <>
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
          Words your last attempt needed 3+ tries on and where you used a hint. Click one to
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
                  {(w.hint_count ?? 0) > 0 && (
                    <span
                      className="text-[11px] text-amber-600 tabular-nums"
                      title={`Hint used ${w.hint_count} time${w.hint_count === 1 ? '' : 's'}`}
                    >
                      💡{w.hint_count}
                    </span>
                  )}
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
  )
}
