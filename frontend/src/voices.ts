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
