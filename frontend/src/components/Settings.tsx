import { useState, useEffect, useCallback } from 'react'
import { AppHeader } from './AppHeader'
import {
  getConfig,
  setConfig,
  listAIKeys,
  addAIKey,
  activateAIKey,
  deleteAIKey,
  type SetConfigPayload,
  type AIKeyHint,
} from '../api'
import { checkGitHubForUpdate, GITHUB_RELEASES_URL } from '../utils/githubUpdate'
import {
  KEYBIND_ACTIONS,
  KEYBIND_DEFAULTS,
  KEYBIND_LABELS,
  loadKeybindings,
  saveKeybindings,
  displayKey,
  type KeybindAction,
} from '../keybindings'
import {
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from '../audio'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePremiumVoices } from '../voices'
import { AudioSection } from './settings/AudioSection'

type SettingsSection = 'ai-api-key' | 'keybindings' | 'audio' | 'playback' | 'about'

const APP_VERSION = `${__APP_SEMVER__} (${__APP_COMMIT__})`

export default function Settings() {
  const {
    pauseInterval,
    setPauseInterval,
    ignorePunctuation,
    setIgnorePunctuation,
    ignoreCase,
    setIgnoreCase,
    repeatCount,
    setRepeatCount,
    ttsVoiceName,
    setTtsVoiceName,
  } = useWorkspace()
  const availableVoices = usePremiumVoices()
  const [activeSection, setActiveSection] = useState<SettingsSection>('ai-api-key')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [aiConfigError, setAiConfigError] = useState<string | null>(null)
  const [aiKeys, setAiKeys] = useState<AIKeyHint[]>([])
  const [aiKeysLoading, setAiKeysLoading] = useState(false)
  const [aiKeysError, setAiKeysError] = useState<string | null>(null)

  const [updateCheckLoading, setUpdateCheckLoading] = useState(false)
  const [updateCheckMessage, setUpdateCheckMessage] = useState<string | null>(null)

  const [keybinds, setKeybinds] = useState(loadKeybindings)
  const [capturingAction, setCapturingAction] = useState<KeybindAction | null>(null)
  const [keybindError, setKeybindError] = useState<string | null>(null)
  const [audio, setAudio] = useState<AudioSettings>(loadAudioSettings)

  const updateAudio = useCallback((patch: Partial<AudioSettings>) => {
    setAudio((prev) => {
      const next = { ...prev, ...patch }
      saveAudioSettings(next)
      return next
    })
  }, [])

  const loadAIKeys = useCallback(() => {
    setAiKeysLoading(true)
    setAiKeysError(null)
    listAIKeys()
      .then((res) => setAiKeys(res.keys))
      .catch(() => {
        setAiKeysError('Failed to load API keys')
      })
      .finally(() => setAiKeysLoading(false))
  }, [])

  useEffect(() => {
    getConfig()
      .then((c) => {
        setHasGeminiKey(Boolean(c.has_gemini_api_key))
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (activeSection !== 'about') setUpdateCheckMessage(null)
  }, [activeSection])

  // Press-to-set capture for keybindings: while a row is armed, the next
  // keydown is taken as the new binding (Escape cancels).
  useEffect(() => {
    if (!capturingAction) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturingAction(null)
        return
      }
      // Bare modifiers: only Command (Meta) is supported as a tap-style binding
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') {
        setKeybindError('Modifier keys other than ⌘ cannot be bound on their own.')
        return
      }
      // Letters, digits and space are typed into the word inputs during practice
      if (/^[a-zA-Z0-9 ]$/.test(e.key)) {
        setKeybindError('Letters, digits and Space are reserved for typing practice — pick a symbol key.')
        return
      }
      const takenBy = KEYBIND_ACTIONS.find(
        (a) => a !== capturingAction && keybinds[a] === e.key
      )
      if (takenBy) {
        setKeybindError(`"${displayKey(e.key)}" is already used by ${KEYBIND_LABELS[takenBy]}.`)
        return
      }
      const next = { ...keybinds, [capturingAction]: e.key }
      setKeybinds(next)
      saveKeybindings(next)
      setKeybindError(null)
      setCapturingAction(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturingAction, keybinds])

  useEffect(() => {
    if (activeSection === 'ai-api-key') {
      loadAIKeys()
    }
  }, [activeSection, loadAIKeys])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const settingsSections = [
    { id: 'ai-api-key' as SettingsSection, label: 'AI API-KEY' },
    { id: 'keybindings' as SettingsSection, label: 'KEYBOARD SHORTCUTS' },
    { id: 'audio' as SettingsSection, label: 'AUDIO' },
    { id: 'playback' as SettingsSection, label: 'PLAYBACK & GRADING' },
    { id: 'about' as SettingsSection, label: 'ABOUT' },
  ]

  const handleApply = async () => {
    setAiConfigError(null)
    try {
      const trimmedKey = apiKey.trim()
      if (trimmedKey) {
        await addAIKey(trimmedKey, true)
        await setConfig({ ai_provider: 'gemini' } satisfies SetConfigPayload)
      } else {
        await setConfig({ ai_provider: 'gemini' } satisfies SetConfigPayload)
      }
      setApiKey('')

      const c = await getConfig()
      setHasGeminiKey(Boolean(c.has_gemini_api_key))
      loadAIKeys()
      console.log('Settings saved')
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      setAiConfigError(ax.response?.data?.detail ?? 'Failed to save AI settings')
      console.error('Failed to save settings', e)
    }
  }

  const handleActivateKey = async (keyId: string) => {
    setAiConfigError(null)
    try {
      await activateAIKey(keyId)
      await setConfig({ ai_provider: 'gemini' } satisfies SetConfigPayload)
      const c = await getConfig()
      setHasGeminiKey(Boolean(c.has_gemini_api_key))
      loadAIKeys()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      setAiConfigError(ax.response?.data?.detail ?? 'Failed to activate API key')
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    setAiConfigError(null)
    try {
      await deleteAIKey(keyId)
      const c = await getConfig()
      setHasGeminiKey(Boolean(c.has_gemini_api_key))
      loadAIKeys()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } }
      setAiConfigError(ax.response?.data?.detail ?? 'Failed to delete API key')
    }
  }

  return (
    <div className="h-screen min-h-0 flex flex-col bg-white">
      {/* Header */}
      <AppHeader
        active="settings"
      />

      {!mobileNavOpen && (
        <div className="border-b border-gray-200 bg-white px-4 py-2.5 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-medium text-indigo-900 hover:bg-indigo-100"
            aria-controls="settings-nav-sidebar"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
            </svg>
            Open settings sections
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <aside
          id="settings-nav-sidebar"
          className={`w-full md:w-80 shrink-0 max-md:max-h-[min(50vh,380px)] md:max-h-none bg-gray-50 border-gray-200 border-b md:border-b-0 md:border-r flex flex-col min-h-0 ${!mobileNavOpen ? 'max-md:hidden' : ''
            }`}
        >
          <div className="md:hidden flex justify-end border-b border-gray-200 px-3 py-1.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900 py-1 px-2 rounded-md hover:bg-indigo-50"
            >
              Done
            </button>
          </div>
          {/* Settings Navigation */}
          <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1 min-h-0">
            {settingsSections.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  setActiveSection(section.id)
                  setMobileNavOpen(false)
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${activeSection === section.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white hover:bg-gray-100 text-gray-900'
                  }`}
              >
                <span className="font-medium">{section.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-white p-4 md:p-6 flex justify-center min-h-0">
          {activeSection === 'ai-api-key' && (
            <div className="w-full max-w-3xl">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">AI API-KEY</h1>
              <p className="text-sm text-gray-600 mb-6">
                AI uses <strong className="text-gray-900">Google Gemini</strong> for the coach and for embeddings (Qdrant).
                {hasGeminiKey ? ' • API key configured' : ' • No API key saved yet'}
              </p>

              <div className="space-y-6">
                {aiConfigError && (
                  <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{aiConfigError}</div>
                )}
                {/* API Key Text Area */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API-KEY
                  </label>
                  <textarea
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasGeminiKey
                        ? 'Key is configured. Paste a new key to replace it.'
                        : 'Enter your Gemini API key here...'
                    }
                    rows={8}
                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleApply}
                      className="px-4 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      ADD
                    </button>
                  </div>
                </div>

                {/* Saved keys list (all providers) */}
                <div className="pt-4 border-t border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-900 mb-2">
                    Saved keys
                  </h2>
                  {aiKeysError && (
                    <div className="mb-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{aiKeysError}</div>
                  )}
                  {aiKeysLoading ? (
                    <p className="text-sm text-gray-600">Loading keys…</p>
                  ) : aiKeys.length === 0 ? (
                    <p className="text-sm text-gray-600">No keys saved yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {aiKeys.map((k) => (
                        <li
                          key={k.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-900">
                              <span className="mr-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                                Gemini
                              </span>
                              …{k.last4 || '????'}
                              {k.is_active && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                  Active
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-500">
                              Added {new Date(k.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {!k.is_active && (
                              <button
                                type="button"
                                onClick={() => handleActivateKey(k.id)}
                                className="px-2 py-1 text-xs font-medium text-gray-900 border border-gray-300 rounded hover:bg-gray-50"
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteKey(k.id)}
                              className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>
            </div>
          )}

          {activeSection === 'keybindings' && (
            <div className="w-full max-w-3xl">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">KEYBOARD SHORTCUTS</h1>
              <p className="text-sm text-gray-600 mb-6">
                Click a shortcut, then press the desired key. Press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">Esc</kbd> to cancel.
                Letters, digits and Space can't be bound — they're used for typing practice.
              </p>

              <div className="space-y-6">
                {keybindError && (
                  <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{keybindError}</div>
                )}

                <ul className="space-y-2">
                  {KEYBIND_ACTIONS.map((action) => (
                    <li
                      key={action}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <span className="text-sm text-gray-900">{KEYBIND_LABELS[action]}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setKeybindError(null)
                          setCapturingAction(capturingAction === action ? null : action)
                        }}
                        className={`min-w-[7rem] px-3 py-1.5 text-sm font-mono rounded-lg border transition-colors ${capturingAction === action
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 animate-pulse'
                          : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                          }`}
                      >
                        {capturingAction === action ? 'Press a key…' : displayKey(keybinds[action])}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Changes apply the next time you open the Workspace.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setKeybinds({ ...KEYBIND_DEFAULTS })
                      saveKeybindings({ ...KEYBIND_DEFAULTS })
                      setCapturingAction(null)
                      setKeybindError(null)
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'audio' && (
            <AudioSection
              audio={audio}
              setAudio={setAudio}
              updateAudio={updateAudio}
              ttsVoiceName={ttsVoiceName}
              setTtsVoiceName={setTtsVoiceName}
              availableVoices={availableVoices}
            />
          )}

          {activeSection === 'playback' && (
            <div className="w-full max-w-3xl text-left">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">PLAYBACK &amp; GRADING</h1>
              <p className="text-sm text-gray-600 mb-6">
                How sentences repeat and pause during practice, and how strictly your typing is graded.
              </p>

              <div className="space-y-4">
                {/* Repeat count */}
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Repeat count</p>
                    <p className="text-xs text-gray-500">How many times each sentence plays before advancing (∞ = until you move on).</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {([0, 1, 3, 5, 10, '∞'] as const).map((count) => (
                      <button
                        key={String(count)}
                        type="button"
                        onClick={() => setRepeatCount(count === '∞' ? '∞' : count)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${repeatCount === count
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-semibold'
                          : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                          }`}
                      >
                        {count === '∞' ? '∞' : count}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pause interval */}
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Pause between plays</p>
                    <p className="text-xs text-gray-500">Silent gap after a sentence finishes, in seconds.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={0.5}
                      value={pauseInterval}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (Number.isFinite(v)) setPauseInterval(Math.min(60, Math.max(0, v)))
                      }}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-500">sec</span>
                  </div>
                </div>

                {/* Ignore punctuation */}
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Ignore punctuation</p>
                    <p className="text-xs text-gray-500">When on, punctuation isn't required to match (commas, periods, etc.).</p>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={ignorePunctuation}
                      onChange={(e) => setIgnorePunctuation(e.target.checked)}
                    />
                    <div className="relative w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>

                {/* Ignore case */}
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Ignore case</p>
                    <p className="text-xs text-gray-500">When on, uppercase and lowercase are treated the same.</p>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={ignoreCase}
                      onChange={(e) => setIgnoreCase(e.target.checked)}
                    />
                    <div className="relative w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'about' && (
            <div className="w-full max-w-3xl">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">ABOUT</h1>

              <section className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center shadow-sm">
                      <img src="/icon.png" alt="Ear2Finger" className="w-14 h-14 rounded-xl" />
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-semibold text-gray-900">Ear2Finger</p>
                      <p className="text-[12px] text-gray-500">Dictation workspace powered by YouTube & AI.</p>
                    </div>
                  </div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Turn YouTube listening into active dictation practice
                  </h2>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    Ear2Finger converts YouTube videos with subtitles into sentence-by-sentence
                    dictation lessons. Practice with per-word inputs, get real-time feedback, and
                    use your AI coach to recommend what to study next.
                  </p>
                </div>

                <div className="w-full md:w-56 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-left">

                    <dl className="mt-1 w-full text-sm space-y-3">
                      <div className="flex flex-col gap-1.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Version
                        </dt>
                        <dd className="mt-0.5 font-mono text-gray-900 break-all">{APP_VERSION}</dd>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={updateCheckLoading}
                            onClick={async () => {
                              setUpdateCheckMessage(null)
                              setUpdateCheckLoading(true)
                              try {
                                const r = await checkGitHubForUpdate(__APP_SEMVER__)
                                if (!r.ok) {
                                  setUpdateCheckMessage(r.message)
                                  return
                                }
                                if (r.upToDate) {
                                  setUpdateCheckMessage(
                                    `You are up to date (${__APP_SEMVER__}). Latest release: ${r.latest}.`,
                                  )
                                } else {
                                  setUpdateCheckMessage(
                                    `Update available: ${r.latest} (you have ${__APP_SEMVER__}). See GitHub Releases for downloads.`,
                                  )
                                }
                              } finally {
                                setUpdateCheckLoading(false)
                              }
                            }}
                            className="self-start px-2 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {updateCheckLoading ? 'Checking…' : 'Check for updates'}
                          </button>
                          {updateCheckMessage && (
                            <p className="text-xs text-gray-600 leading-snug">{updateCheckMessage}</p>
                          )}
                          <a
                            href={GITHUB_RELEASES_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            Releases &amp; downloads on GitHub →
                          </a>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Repository
                        </dt>
                        <dd className="mt-0.5">
                          <a
                            href="https://github.com/stephenyin/Ear2Finger"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-gray-800 hover:text-indigo-700 hover:underline"
                          >
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              fill="currentColor"
                            >
                              <path d="M12 0.5C5.373 0.5 0 5.872 0 12.5c0 5.297 3.438 9.787 8.205 11.387.6.111.82-.261.82-.58 0-.287-.011-1.243-.017-2.255-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.809 1.304 3.495.997.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.332-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.42 11.42 0 0 1 3.003-.404c1.018.005 2.045.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.119 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.807 5.624-5.48 5.921.431.372.815 1.102.815 2.222 0 1.604-.015 2.896-.015 3.289 0 .321.216.697.825.579C20.565 22.283 24 17.793 24 12.5 24 5.872 18.627 0.5 12 0.5z" />
                            </svg>
                            <span className="truncate max-w-[16rem]">stephenyin/Ear2Finger</span>
                          </a>
                        </dd>
                      </div>
                      <div className="flex flex-col">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          LinkedIn
                        </dt>
                        <dd className="mt-0.5">
                          <a
                            href="https://www.linkedin.com/in/hang-yin-stephen/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-gray-800 hover:text-indigo-700 hover:underline"
                          >
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              fill="currentColor"
                            >
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.852 0-2.136 1.445-2.136 2.938v5.668H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.602 0 4.266 2.37 4.266 5.455v6.286zM5.337 7.433c-1.084 0-1.959-.875-1.959-1.957 0-1.083.875-1.958 1.959-1.958 1.082 0 1.957.875 1.957 1.958 0 1.082-.875 1.957-1.957 1.957zM7.119 20.452H3.555V9h3.564v11.452z" />
                            </svg>
                            <span className="truncate max-w-[16rem]">hang-yin-stephen</span>
                          </a>
                        </dd>
                      </div>
                      <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
                        Build date: {new Date().toLocaleDateString()}
                      </p>
                    </dl>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
