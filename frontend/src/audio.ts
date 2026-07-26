// Practice feedback sounds (celebration chime on a fully-correct sentence,
// buzz on a wrong keystroke) plus their user settings. Shared by Workspace
// (playback) and Settings (the audio editor). Persisted in localStorage.

export type Waveform = 'sawtooth' | 'square' | 'triangle' | 'sine'
export const WAVEFORMS: Waveform[] = ['sawtooth', 'square', 'triangle', 'sine']

export interface AudioSettings {
  correctEnabled: boolean
  correctVolume: number // 0..1
  // Celebration-chime shape (adjustable in Settings)
  correctBaseFreq: number // Hz of the root note
  correctNoteCount: number // how many arpeggio notes play
  correctNoteSpacing: number // seconds between note onsets
  correctNoteDuration: number // seconds each note rings
  correctWaveform: Waveform
  errorEnabled: boolean
  errorVolume: number // 0..1
  // Error-buzz shape (adjustable in Settings)
  errorFreqStart: number // Hz
  errorFreqEnd: number // Hz
  errorDuration: number // seconds
  errorWaveform: Waveform
}

export const AUDIO_DEFAULTS: AudioSettings = {
  correctEnabled: true,
  correctVolume: 0.6,
  correctBaseFreq: 523.25, // C5
  correctNoteCount: 4,
  correctNoteSpacing: 0.09,
  correctNoteDuration: 0.3,
  correctWaveform: 'triangle',
  errorEnabled: true,
  errorVolume: 0.7,
  errorFreqStart: 180,
  errorFreqEnd: 110,
  errorDuration: 0.32,
  errorWaveform: 'sawtooth',
}

const STORAGE_KEY = 'ear2finger-audio-settings'

export function loadAudioSettings(): AudioSettings {
  const result = { ...AUDIO_DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const parsed = JSON.parse(raw) as Partial<AudioSettings>
    if (typeof parsed.correctEnabled === 'boolean') result.correctEnabled = parsed.correctEnabled
    if (typeof parsed.errorEnabled === 'boolean') result.errorEnabled = parsed.errorEnabled
    if (typeof parsed.correctVolume === 'number') result.correctVolume = clamp01(parsed.correctVolume)
    if (typeof parsed.correctBaseFreq === 'number') result.correctBaseFreq = clampFreq(parsed.correctBaseFreq)
    if (typeof parsed.correctNoteCount === 'number') result.correctNoteCount = clampNoteCount(parsed.correctNoteCount)
    if (typeof parsed.correctNoteSpacing === 'number') result.correctNoteSpacing = clampSpacing(parsed.correctNoteSpacing)
    if (typeof parsed.correctNoteDuration === 'number') result.correctNoteDuration = clampDuration(parsed.correctNoteDuration)
    if (typeof parsed.correctWaveform === 'string' && WAVEFORMS.includes(parsed.correctWaveform as Waveform)) {
      result.correctWaveform = parsed.correctWaveform as Waveform
    }
    if (typeof parsed.errorVolume === 'number') result.errorVolume = clamp01(parsed.errorVolume)
    if (typeof parsed.errorFreqStart === 'number') result.errorFreqStart = clampFreq(parsed.errorFreqStart)
    if (typeof parsed.errorFreqEnd === 'number') result.errorFreqEnd = clampFreq(parsed.errorFreqEnd)
    if (typeof parsed.errorDuration === 'number') result.errorDuration = clampDuration(parsed.errorDuration)
    if (typeof parsed.errorWaveform === 'string' && WAVEFORMS.includes(parsed.errorWaveform as Waveform)) {
      result.errorWaveform = parsed.errorWaveform as Waveform
    }
  } catch {
    // malformed JSON — fall back to defaults
  }
  return result
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable — settings still apply for this session
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

// Bounds shared by the Settings sliders and the runtime clamp.
export const ERROR_FREQ_MIN = 40
export const ERROR_FREQ_MAX = 2000
export const ERROR_DURATION_MIN = 0.05
export const ERROR_DURATION_MAX = 1.5
export const NOTE_COUNT_MIN = 1
export const NOTE_COUNT_MAX = 6
export const NOTE_SPACING_MIN = 0
export const NOTE_SPACING_MAX = 0.5

function clampFreq(v: number): number {
  return Math.min(ERROR_FREQ_MAX, Math.max(ERROR_FREQ_MIN, v))
}

function clampDuration(v: number): number {
  return Math.min(ERROR_DURATION_MAX, Math.max(ERROR_DURATION_MIN, v))
}

function clampNoteCount(v: number): number {
  return Math.min(NOTE_COUNT_MAX, Math.max(NOTE_COUNT_MIN, Math.round(v)))
}

function clampSpacing(v: number): number {
  return Math.min(NOTE_SPACING_MAX, Math.max(NOTE_SPACING_MIN, v))
}

// Major-arpeggio ratios relative to the base note: root, M3, P5, octave,
// then M3 and P5 an octave up. The chime plays the first N of these.
const ARPEGGIO_RATIOS = [1, 1.25, 1.5, 2, 2.5, 3]

// Lazily created, reused across calls. Peak gain scales with the passed volume
// (0..1); 0.5 is the loudest peak so several oscillators can't clip.
let audioCtx: AudioContext | null = null

export interface CelebrationChimeOptions {
  volume?: number
  baseFreq?: number
  noteCount?: number
  noteSpacing?: number
  noteDuration?: number
  waveform?: Waveform
}

// Ascending arpeggio built from the base note — no bundled asset, works
// offline. Pitch, note count, timing and waveform are all adjustable from
// the Settings audio panel.
export function playCelebrationChime(opts: CelebrationChimeOptions = {}): void {
  const v = clamp01(opts.volume ?? 1)
  if (v <= 0) return
  const baseFreq = clampFreq(opts.baseFreq ?? AUDIO_DEFAULTS.correctBaseFreq)
  const noteCount = clampNoteCount(opts.noteCount ?? AUDIO_DEFAULTS.correctNoteCount)
  const spacing = clampSpacing(opts.noteSpacing ?? AUDIO_DEFAULTS.correctNoteSpacing)
  const duration = clampDuration(opts.noteDuration ?? AUDIO_DEFAULTS.correctNoteDuration)
  const waveform = opts.waveform ?? AUDIO_DEFAULTS.correctWaveform
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    ARPEGGIO_RATIOS.slice(0, noteCount).forEach((ratio, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = waveform
      osc.frequency.value = baseFreq * ratio
      const t = now + i * spacing
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + duration + 0.03)
    })
  } catch {
    /* audio unavailable — silent */
  }
}

export interface MistakeBuzzOptions {
  volume?: number
  freqStart?: number
  freqEnd?: number
  duration?: number
  waveform?: Waveform
}

// Buzz for a wrong keystroke. Frequency slide, duration and waveform are all
// adjustable from the Settings audio panel.
export function playMistakeBuzz(opts: MistakeBuzzOptions = {}): void {
  const v = clamp01(opts.volume ?? 1)
  if (v <= 0) return
  const freqStart = clampFreq(opts.freqStart ?? AUDIO_DEFAULTS.errorFreqStart)
  const freqEnd = clampFreq(opts.freqEnd ?? AUDIO_DEFAULTS.errorFreqEnd)
  const duration = clampDuration(opts.duration ?? AUDIO_DEFAULTS.errorDuration)
  const waveform = opts.waveform ?? AUDIO_DEFAULTS.errorWaveform
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = waveform
    osc.frequency.setValueAtTime(freqStart, now)
    // exponentialRampToValueAtTime needs a strictly-positive target
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration * 0.9)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.5 * v, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + duration + 0.03)
  } catch {
    /* audio unavailable — silent */
  }
}
