import { useEffect, useState } from 'react'

// The best available browser TTS voices, sorted by name. Shared by Workspace
// (playback), Practice and Settings (the voice picker) so all three see the
// same list.
//
// Different browsers name their voices differently, so we pick with a fallback
// chain rather than a single filter:
//   1. "premium"/"enhanced" voices — Chromium/Electron's "Google … (Premium)"
//      and Safari's "… (Enhanced)" high-quality variants.
//   2. if none, any English voices — Safari's default set ("Samantha", "Alex"…)
//      contains no "premium" marker, so this is what makes it work there.
//   3. if still none, every voice the browser offers.
//
// Loading is done once at module level rather than per-hook: `onvoiceschanged`
// is a single slot, so three components each assigning their own handler meant
// only the last one mounted ever heard the event — and the first to unmount
// nulled it for everyone. On Chrome, where getVoices() is empty until that
// event fires, that left components with no voices at all and playback falling
// back to the system default. addEventListener + a shared cache fixes it.

function selectVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const byName = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
    a.name.localeCompare(b.name)

  const premium = all.filter((v) => {
    const n = v.name.toLowerCase()
    return n.includes('premium') || n.includes('enhanced')
  })
  const english = all.filter((v) => v.lang.toLowerCase().startsWith('en'))

  const chosen = premium.length ? premium : english.length ? english : all
  return [...chosen].sort(byName)
}

let cachedVoices: SpeechSynthesisVoice[] = []
const subscribers = new Set<(voices: SpeechSynthesisVoice[]) => void>()
let listening = false

function refreshVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const all = window.speechSynthesis.getVoices()
  if (!all.length) return
  cachedVoices = selectVoices(all)
  subscribers.forEach((fn) => fn(cachedVoices))
}

function startListening() {
  if (listening || typeof window === 'undefined' || !window.speechSynthesis) return
  listening = true
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
  refreshVoices()
  // Chrome does not always fire `voiceschanged` (notably on a reload where the
  // voice list is already warm), so poll briefly as a backstop.
  let tries = 0
  const poll = setInterval(() => {
    refreshVoices()
    if (cachedVoices.length || ++tries > 20) clearInterval(poll)
  }, 250)
}

export function usePremiumVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(cachedVoices)

  useEffect(() => {
    subscribers.add(setVoices)
    startListening()
    if (cachedVoices.length) setVoices(cachedVoices)
    return () => {
      subscribers.delete(setVoices)
    }
  }, [])

  return voices
}

// Cloud ("network") voices are synthesized on a remote server, so every
// utterance costs an HTTPS round-trip before any audio plays — Edge's
// "Microsoft Ana Online (Natural)" family is the common case. Callers use this
// to drop the warm-up primer (a wasted second round-trip) and to compensate the
// word-by-word gap for the delay.
//
// localService is the spec-provided signal, but not every engine reports it
// correctly, so Edge's naming convention is matched as a backstop.
export function isNetworkVoice(voice: SpeechSynthesisVoice | null | undefined): boolean {
  if (!voice) return false
  if (voice.localService === false) return true
  return /online\s*\(natural\)/i.test(voice.name)
}

// Rolling estimate of how long a voice takes between speak() and onstart, kept
// per voice name. Word-by-word playback subtracts this from the gap it waits so
// the silence the learner hears is the gap they configured, not gap + latency.
const latencyByVoice = new Map<string, number>()

// Never let a freak measurement (a stalled request, a backgrounded tab) eat the
// whole gap; compensation is capped well below any usable Word Gap.
const MAX_TRACKED_LATENCY_MS = 1500

export function recordVoiceLatency(voiceName: string, ms: number): void {
  if (!voiceName || !Number.isFinite(ms) || ms < 0) return
  const sample = Math.min(ms, MAX_TRACKED_LATENCY_MS)
  const prev = latencyByVoice.get(voiceName)
  // Exponential moving average: smooths jitter but still tracks a network that
  // gets slower or faster part-way through a lesson.
  latencyByVoice.set(voiceName, prev === undefined ? sample : prev * 0.7 + sample * 0.3)
}

export function estimatedVoiceLatency(voiceName: string | undefined | null): number {
  if (!voiceName) return 0
  return latencyByVoice.get(voiceName) ?? 0
}

// Chrome silently stops synthesis roughly 15 seconds into a single utterance.
// Nudging it with pause()/resume() on a timer keeps long sentences audible.
// Harmless on Safari/Electron, which don't have the bug.
export function startSpeechKeepAlive(): () => void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return () => {}
  const synth = window.speechSynthesis
  const timer = setInterval(() => {
    if (synth.speaking && !synth.paused) {
      synth.pause()
      synth.resume()
    }
  }, 10000)
  return () => clearInterval(timer)
}
