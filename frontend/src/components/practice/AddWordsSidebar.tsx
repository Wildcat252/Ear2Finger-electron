interface AddWordsSidebarProps {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  newWords: string
  setNewWords: (v: string) => void
  adding: boolean
  addMessage: string | null
  customWords: string[]
  binnedSet: Set<string>
  handleAddWords: () => void
  displayOf: (word: string) => string
}

/** Sidebar for adding your own practice words, plus the list of them. */
export function AddWordsSidebar({
  sidebarOpen,
  sidebarCollapsed,
  newWords,
  setNewWords,
  adding,
  addMessage,
  customWords,
  binnedSet,
  handleAddWords,
  displayOf,
}: AddWordsSidebarProps) {
  return (
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
  )
}
