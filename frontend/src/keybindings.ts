// Rebindable workspace shortcuts, shared by Workspace (handler + hint bar)
// and Settings (keybinding editor). Persisted in localStorage.

export type KeybindAction =
  | 'prevSentence'
  | 'nextSentence'
  | 'replay'
  | 'playPause'
  | 'translate'
  | 'speedDown'
  | 'speedUp'
  | 'wordByWord'
  | 'skipWord'

export type Keybindings = Record<KeybindAction, string>

export const KEYBIND_DEFAULTS: Keybindings = {
  prevSentence: '[',
  nextSentence: ']',
  replay: '\\',
  playPause: 'Enter',
  translate: '`',
  speedDown: '-',
  speedUp: '=',
  wordByWord: 'Meta',
  skipWord: '/',
}

export const KEYBIND_LABELS: Record<KeybindAction, string> = {
  prevSentence: 'Previous sentence',
  nextSentence: 'Next sentence',
  replay: 'Replay sentence',
  playPause: 'Play / pause',
  translate: 'Translate sentence',
  speedDown: 'Decrease speed',
  speedUp: 'Increase speed',
  wordByWord: 'Toggle word-by-word',
  skipWord: 'Skip word (word-by-word)',
}

export const KEYBIND_ACTIONS = Object.keys(KEYBIND_DEFAULTS) as KeybindAction[]

const STORAGE_KEY = 'ear2finger-keybindings'

export function loadKeybindings(): Keybindings {
  const result = { ...KEYBIND_DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const action of KEYBIND_ACTIONS) {
      const v = parsed[action]
      if (typeof v === 'string' && v.length > 0) result[action] = v
    }
  } catch {
    // malformed JSON — fall back to defaults
  }
  return result
}

export function saveKeybindings(bindings: Keybindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    // storage unavailable — bindings still apply for this session
  }
}

export function displayKey(key: string): string {
  if (key === 'Meta') return '⌘'
  if (key === ' ') return 'Space'
  return key
}
