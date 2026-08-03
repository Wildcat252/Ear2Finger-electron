import { useEffect, useState } from 'react'

// The best available browser TTS voices, sorted by name. Shared by Workspace
// (playback) and Settings (the voice picker) so both see the same list.
//
// Different browsers name their voices differently, so we pick with a fallback
// chain rather than a single filter:
//   1. "premium"/"enhanced" voices — Chromium/Electron's "Google … (Premium)"
//      and Safari's "… (Enhanced)" high-quality variants.
//   2. if none, any English voices — Safari's default set ("Samantha", "Alex"…)
//      contains no "premium" marker, so this is what makes it work there.
//   3. if still none, every voice the browser offers.
export function usePremiumVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices()
      if (!all.length) return

      const byName = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
        a.name.localeCompare(b.name)

      const premium = all.filter((v) => {
        const n = v.name.toLowerCase()
        return n.includes('premium') || n.includes('enhanced')
      })
      const english = all.filter((v) => v.lang.toLowerCase().startsWith('en'))

      const chosen = premium.length ? premium : english.length ? english : all
      setVoices([...chosen].sort(byName))
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  return voices
}
