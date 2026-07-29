import { useEffect, useState } from 'react'

// Premium browser TTS voices, sorted by name. Shared by Workspace (playback)
// and Settings (the voice picker) so both see the same list.
export function usePremiumVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices()
      if (all.length) {
        const premium = all
          .filter((v) => v.name.toLowerCase().includes('premium'))
          .sort((a, b) => a.name.localeCompare(b.name))
        setVoices(premium)
      }
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  return voices
}
