import {
  AUDIO_DEFAULTS,
  WAVEFORMS,
  ERROR_FREQ_MIN,
  ERROR_FREQ_MAX,
  ERROR_DURATION_MIN,
  ERROR_DURATION_MAX,
  NOTE_COUNT_MIN,
  NOTE_COUNT_MAX,
  NOTE_SPACING_MIN,
  NOTE_SPACING_MAX,
  saveAudioSettings,
  playCelebrationChime,
  playMistakeBuzz,
  type AudioSettings,
  type Waveform,
} from '../../audio'

interface AudioSectionProps {
  audio: AudioSettings
  setAudio: (v: AudioSettings) => void
  updateAudio: (patch: Partial<AudioSettings>) => void
  ttsVoiceName: string
  setTtsVoiceName: (v: string) => void
  availableVoices: SpeechSynthesisVoice[]
}

/** Settings → AUDIO: dictation voice plus the correct/error feedback sounds. */
export function AudioSection({
  audio,
  setAudio,
  updateAudio,
  ttsVoiceName,
  setTtsVoiceName,
  availableVoices,
}: AudioSectionProps) {
  return (
          <div className="w-full max-w-3xl text-left">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">AUDIO</h1>
            <p className="text-sm text-gray-600 mb-6">
              Feedback sounds during dictation practice. Each can be toggled on or off and has its own volume.
            </p>

            <div className="space-y-6">
              {/* TTS voice */}
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900">Dictation voice</p>
                <p className="text-xs text-gray-500 mb-3">Voice used to read text lessons aloud.</p>
                <select
                  value={ttsVoiceName}
                  onChange={(e) => setTtsVoiceName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Default</option>
                  {availableVoices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              {/* Correct sound */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Correct sound</p>
                    <p className="text-xs text-gray-500">Chime when a sentence is fully correct.</p>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={audio.correctEnabled}
                      onChange={(e) => updateAudio({ correctEnabled: e.target.checked })}
                    />
                    <div className="relative w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(audio.correctVolume * 100)}
                    disabled={!audio.correctEnabled}
                    onChange={(e) => updateAudio({ correctVolume: Number(e.target.value) / 100 })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-10 text-right tabular-nums">{Math.round(audio.correctVolume * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => playCelebrationChime({
                      volume: audio.correctVolume,
                      baseFreq: audio.correctBaseFreq,
                      noteCount: audio.correctNoteCount,
                      noteSpacing: audio.correctNoteSpacing,
                      noteDuration: audio.correctNoteDuration,
                      waveform: audio.correctWaveform,
                    })}
                    disabled={!audio.correctEnabled}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Test
                  </button>
                </div>

                {/* Waveform */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Waveform</span>
                  <div className="flex gap-1">
                    {WAVEFORMS.map((wf) => (
                      <button
                        key={wf}
                        type="button"
                        disabled={!audio.correctEnabled}
                        onClick={() => updateAudio({ correctWaveform: wf as Waveform })}
                        className={`px-2.5 py-1 text-xs rounded-lg border capitalize transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${audio.correctWaveform === wf
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-semibold'
                          : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                          }`}
                      >
                        {wf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Base pitch */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Base Hz</span>
                  <input
                    type="range"
                    min={ERROR_FREQ_MIN}
                    max={ERROR_FREQ_MAX}
                    value={Math.round(audio.correctBaseFreq)}
                    disabled={!audio.correctEnabled}
                    onChange={(e) => updateAudio({ correctBaseFreq: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{Math.round(audio.correctBaseFreq)} Hz</span>
                </div>

                {/* Note count */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Notes</span>
                  <input
                    type="range"
                    min={NOTE_COUNT_MIN}
                    max={NOTE_COUNT_MAX}
                    step={1}
                    value={audio.correctNoteCount}
                    disabled={!audio.correctEnabled}
                    onChange={(e) => updateAudio({ correctNoteCount: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{audio.correctNoteCount}</span>
                </div>

                {/* Note spacing */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Spacing</span>
                  <input
                    type="range"
                    min={Math.round(NOTE_SPACING_MIN * 1000)}
                    max={Math.round(NOTE_SPACING_MAX * 1000)}
                    step={10}
                    value={Math.round(audio.correctNoteSpacing * 1000)}
                    disabled={!audio.correctEnabled}
                    onChange={(e) => updateAudio({ correctNoteSpacing: Number(e.target.value) / 1000 })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{Math.round(audio.correctNoteSpacing * 1000)} ms</span>
                </div>

                {/* Note duration */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Ring</span>
                  <input
                    type="range"
                    min={Math.round(ERROR_DURATION_MIN * 1000)}
                    max={Math.round(ERROR_DURATION_MAX * 1000)}
                    step={10}
                    value={Math.round(audio.correctNoteDuration * 1000)}
                    disabled={!audio.correctEnabled}
                    onChange={(e) => updateAudio({ correctNoteDuration: Number(e.target.value) / 1000 })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{Math.round(audio.correctNoteDuration * 1000)} ms</span>
                </div>
              </div>

              {/* Error sound */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Error sound</p>
                    <p className="text-xs text-gray-500">Buzz on a wrong keystroke.</p>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={audio.errorEnabled}
                      onChange={(e) => updateAudio({ errorEnabled: e.target.checked })}
                    />
                    <div className="relative w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(audio.errorVolume * 100)}
                    disabled={!audio.errorEnabled}
                    onChange={(e) => updateAudio({ errorVolume: Number(e.target.value) / 100 })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-10 text-right tabular-nums">{Math.round(audio.errorVolume * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => playMistakeBuzz({
                      volume: audio.errorVolume,
                      freqStart: audio.errorFreqStart,
                      freqEnd: audio.errorFreqEnd,
                      duration: audio.errorDuration,
                      waveform: audio.errorWaveform,
                    })}
                    disabled={!audio.errorEnabled}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Test
                  </button>
                </div>

                {/* Waveform */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Waveform</span>
                  <div className="flex gap-1">
                    {WAVEFORMS.map((wf) => (
                      <button
                        key={wf}
                        type="button"
                        disabled={!audio.errorEnabled}
                        onClick={() => updateAudio({ errorWaveform: wf as Waveform })}
                        className={`px-2.5 py-1 text-xs rounded-lg border capitalize transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${audio.errorWaveform === wf
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-semibold'
                          : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                          }`}
                      >
                        {wf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start frequency */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Start Hz</span>
                  <input
                    type="range"
                    min={ERROR_FREQ_MIN}
                    max={ERROR_FREQ_MAX}
                    value={Math.round(audio.errorFreqStart)}
                    disabled={!audio.errorEnabled}
                    onChange={(e) => updateAudio({ errorFreqStart: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{Math.round(audio.errorFreqStart)} Hz</span>
                </div>

                {/* End frequency */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">End Hz</span>
                  <input
                    type="range"
                    min={ERROR_FREQ_MIN}
                    max={ERROR_FREQ_MAX}
                    value={Math.round(audio.errorFreqEnd)}
                    disabled={!audio.errorEnabled}
                    onChange={(e) => updateAudio({ errorFreqEnd: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{Math.round(audio.errorFreqEnd)} Hz</span>
                </div>

                {/* Duration */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">Duration</span>
                  <input
                    type="range"
                    min={Math.round(ERROR_DURATION_MIN * 1000)}
                    max={Math.round(ERROR_DURATION_MAX * 1000)}
                    step={10}
                    value={Math.round(audio.errorDuration * 1000)}
                    disabled={!audio.errorEnabled}
                    onChange={(e) => updateAudio({ errorDuration: Number(e.target.value) / 1000 })}
                    className="flex-1 accent-indigo-600 disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-600 w-14 text-right tabular-nums">{Math.round(audio.errorDuration * 1000)} ms</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-xs text-gray-500">Changes apply the next time you open the Workspace.</p>
                <button
                  type="button"
                  onClick={() => { setAudio({ ...AUDIO_DEFAULTS }); saveAudioSettings({ ...AUDIO_DEFAULTS }) }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
  )
}
