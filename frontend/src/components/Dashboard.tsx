import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import {
  getUserStats,
  getCoachFeedback,
  getCoachRecommendations,
  type DailyUserStats,
  type UserStats,
  type CoachFeedbackResponse,
  type PracticeRecommendationItem,
} from '../api'

const COACH_FEEDBACK_STORAGE_KEY = 'ear2finger_ai_coach_feedback_v1'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coachModalOpen, setCoachModalOpen] = useState(false)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedbackResponse | null>(null)
  const [coachPracticeRecs, setCoachPracticeRecs] = useState<PracticeRecommendationItem[] | null>(null)
  const [coachPracticeError, setCoachPracticeError] = useState<string | null>(null)

  const normalizeSuggestion = (text: string): string => {
    return text
      .trim()
      .replace(/^\s*[-*]\s+/, '')
      .replace(/^\s*\d+[).\s-]+/, '')
      .replace(/\s+/g, ' ')
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    getUserStats()
      .then(setStats)
      .catch((e) => {
        const err = e as { response?: { data?: { detail?: string } } }
        setError(err.response?.data?.detail || 'Failed to load stats')
      })
      .finally(() => setLoading(false))
  }, [])

  const loadCoachFeedback = () => {
    setCoachLoading(true)
    setCoachError(null)
    setCoachPracticeError(null)
    setCoachPracticeRecs(null)
    getCoachFeedback()
      .then((data) => {
        setCoachFeedback(data)
        try {
          window.localStorage.setItem(
            COACH_FEEDBACK_STORAGE_KEY,
            JSON.stringify(data)
          )
        } catch {
          // ignore storage errors
        }
      })
      .catch((e) => {
        const err = e as { response?: { data?: { detail?: string } } }
        setCoachError(
          err.response?.data?.detail ||
            'AI coach is unavailable. Check your AI API key in Settings.'
        )
      })
      .finally(() => setCoachLoading(false))
  }

  const loadCoachRecommendations = () => {
    setCoachPracticeError(null)
    setCoachPracticeRecs(null)
    getCoachRecommendations()
      .then((data) => {
        setCoachPracticeRecs(data.recommendations ?? [])
      })
      .catch((e) => {
        const err = e as { response?: { data?: { detail?: string } } }
        setCoachPracticeError(
          err.response?.data?.detail ||
            'AI recommendations are unavailable. Check your AI API key in Settings.'
        )
      })
  }

  const handleOpenCoach = () => {
    setCoachModalOpen(true)
    loadCoachFeedback()
    loadCoachRecommendations()
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COACH_FEEDBACK_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as CoachFeedbackResponse
      if (
        parsed &&
        typeof parsed.summary === 'string' &&
        Array.isArray(parsed.suggestions)
      ) {
        setCoachFeedback(parsed)
      }
    } catch {
      // ignore parse/storage errors
    }
  }, [])

  const coachSuggestions = useMemo(() => {
    const fallback = [
      'Try slightly longer sentences to build stamina.',
      'Review words you have missed 3+ times this week.',
      'Aim for 5 more sentences today to keep your streak.',
    ]
    const source =
      coachFeedback?.suggestions?.length ? coachFeedback.suggestions : fallback
    return source
      .map((s) => normalizeSuggestion(s))
      .filter(Boolean)
  }, [coachFeedback])

  const recentDaily = useMemo<DailyUserStats[]>(() => {
    if (!stats?.daily) return []
    const days = stats.daily.slice(-14) // last 14 days
    return days
  }, [stats])

  const maxDailySentences = useMemo(
    () => Math.max(1, ...recentDaily.map((d) => d.total_sentences_practiced || 0)),
    [recentDaily]
  )

  const maxDailyErrorHintPct = useMemo(
    () =>
      Math.max(
        1,
        ...recentDaily.map((d) => {
          const words = d.total_words_seen || 0
          if (!words) return 0
          const incorrectPct = ((d.total_incorrect_words || 0) / words) * 100
          const hintPct = ((d.total_hints_used || 0) / words) * 100
          return Math.max(incorrectPct, hintPct)
        })
      ),
    [recentDaily]
  )

  return (
    <div className="h-screen min-h-0 flex flex-col bg-white">
      {/* Header */}
      <AppHeader
        active="dashboard"
      />

      {/* Main Content */}
      <main className="flex-1 bg-gray-50 overflow-y-auto min-h-0">
        <div className="max-w-6xl mx-auto px-3 py-4 md:px-4 md:py-6 space-y-6">

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && !stats && (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
              Loading your stats…
            </div>
          )}

          {stats && (
            <>
              {/* Summary cards */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Videos practiced"
                  value={stats.total_videos_practiced}
                  sublabel="Unique videos"
                />
                <StatCard
                  label="Sentences practiced"
                  value={stats.total_sentences_practiced}
                  sublabel="Total across all sessions"
                />
                <StatCard
                  label="Words seen"
                  value={stats.total_words_seen}
                  sublabel={`${stats.unique_words_seen} unique`}
                />
                <StatCard
                  label="Hints"
                  value={stats.total_hints_used}
                  sublabel={`${stats.total_incorrect_words} mistakes`}
                />
              </section>

              {/* Daily trends */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">
                    Daily stats
                  </h2>
                  <p className="text-xs text-gray-500 mb-4">
                    Last {recentDaily.length} days
                  </p>
                  {recentDaily.length === 0 ? (
                    <p className="text-xs text-gray-500">No practice data yet.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-900">
                          Sentences practiced per day
                        </h3>
                      </div>
                      <div className="h-40 flex items-end gap-1">
                        {recentDaily.map((d) => {
                          const sentences = d.total_sentences_practiced || 0
                          const barHeight = (sentences / maxDailySentences) * 100
                          const h = Math.max(barHeight, sentences > 0 ? 2 : 0)
                          return (
                            <div
                              key={d.date}
                              className="flex-1 flex flex-col items-center justify-end gap-1"
                            >
                              <div className="relative w-full h-24">
                                <div
                                  className="absolute bottom-0 left-0 right-0 w-full bg-indigo-100 rounded-t-md min-h-[2px]"
                                  style={{ height: `${h}%` }}
                                />
                                <span
                                  className="absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold text-gray-800 tabular-nums whitespace-nowrap leading-none"
                                  style={{ bottom: `calc(${h}% + 4px)` }}
                                >
                                  {sentences}
                                </span>
                              </div>
                              <span className="mt-1 text-[10px] text-gray-500 text-center leading-tight">
                                {d.date.slice(5)}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-5">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-semibold text-gray-900">
                            Daily retries % and hints %
                          </h3>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-rose-400" />
                              Retries %
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                              Hints %
                            </span>
                          </div>
                        </div>
                        <div className="h-32 flex items-end gap-1">
                          {recentDaily.map((d) => {
                            const words = d.total_words_seen || 0
                            const incorrectPct = words
                              ? ((d.total_incorrect_words || 0) / words) * 100
                              : 0
                            const hintPct = words
                              ? ((d.total_hints_used || 0) / words) * 100
                              : 0
                            const incorrectHeight =
                              (incorrectPct / (maxDailyErrorHintPct || 1)) * 100
                            const hintHeight =
                              (hintPct / (maxDailyErrorHintPct || 1)) * 100
                            const ih = Math.max(incorrectHeight, incorrectPct > 0 ? 1 : 0)
                            const hh = Math.max(hintHeight, hintPct > 0 ? 1 : 0)
                            return (
                              <div
                                key={d.date + '-pct'}
                                className="flex-1 flex flex-col items-center justify-end gap-1"
                              >
                                <div className="w-full h-24 flex gap-[2px]">
                                  <div className="relative flex-1 h-full">
                                    <div
                                      className="absolute bottom-0 left-0 right-0 bg-rose-200 rounded-t-sm min-h-[1px]"
                                      style={{ height: `${ih}%` }}
                                      title={`Retries: ${incorrectPct.toFixed(1)}%`}
                                    />
                                    <span
                                      className="absolute left-1/2 -translate-x-1/2 text-[8px] font-semibold text-rose-800 tabular-nums whitespace-nowrap leading-none"
                                      style={{ bottom: `calc(${ih}% + 2px)` }}
                                    >
                                      {incorrectPct.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="relative flex-1 h-full">
                                    <div
                                      className="absolute bottom-0 left-0 right-0 bg-amber-200 rounded-t-sm min-h-[1px]"
                                      style={{ height: `${hh}%` }}
                                      title={`Hints: ${hintPct.toFixed(1)}%`}
                                    />
                                    <span
                                      className="absolute left-1/2 -translate-x-1/2 text-[8px] font-semibold text-amber-900 tabular-nums whitespace-nowrap leading-none"
                                      style={{ bottom: `calc(${hh}% + 2px)` }}
                                    >
                                      {hintPct.toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                                <span className="mt-1 text-[9px] text-gray-500 text-center leading-tight">
                                  {d.date.slice(5)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 w-full flex flex-col min-h-[260px]">
                  <div className="flex flex-col items-start text-left flex-1">
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">
                      AI Language Coach
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                      Learning tips from AI, tailored to your recent practice.
                    </p>
                    <ul className="text-xs text-gray-600 space-y-2 w-full">
                      {coachSuggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 text-indigo-500" aria-hidden>
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="min-w-0 leading-snug">
                            {s}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Recommended channels preview */}
                    <div className="mt-4 pt-3 border-t border-gray-100 w-full">
                      <h3 className="text-[11px] font-semibold text-gray-900 mb-1">
                        Recommended YouTube channels
                      </h3>
                      <p className="text-[11px] text-gray-500 mb-2">
                        Clear English audio and good subtitles, great for importing into Ear2Finger.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: 'TED-Ed', href: 'https://www.youtube.com/@TEDEd' },
                          { name: 'TED', href: 'https://www.youtube.com/@TED' },
                          { name: 'BBC Learning English', href: 'https://www.youtube.com/bbclearningenglish' },
                          { name: 'Kurzgesagt – In a Nutshell', href: 'https://www.youtube.com/kurzgesagt'},
                          { name: 'Veritasium', href: 'https://www.youtube.com/veritasium' },
                          { name: 'Pick Up Limes', href: 'https://www.youtube.com/pickuplimes' },
                          { name: 'Rachel\'s English', href: 'https://www.youtube.com/rachelsenglish' },
                        ].map((ch) => (
                          <a
                            key={ch.href}
                            href={ch.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/40 bg-violet-50 px-2.5 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-100"
                          >
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                fill="currentColor"
                                d="M21.8 8.001a3.002 3.002 0 0 0-2.113-2.123C17.938 5.25 12 5.25 12 5.25s-5.938 0-7.687.628A3.002 3.002 0 0 0 2.2 8.001C1.575 9.757 1.575 12.75 1.575 12.75s0 2.993.625 4.749a3.002 3.002 0 0 0 2.113 2.123C6.062 20.25 12 20.25 12 20.25s5.938 0 7.687-.628a3.002 3.002 0 0 0 2.113-2.123c.625-1.756.625-4.749.625-4.749s0-2.993-.625-4.749ZM10.25 15.5v-5l4.5 2.5-4.5 2.5Z"
                              />
                            </svg>
                            <span className="truncate max-w-[7rem]">{ch.name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCoach}
                    className="mt-3 inline-flex items-center text-xs text-indigo-600 hover:text-indigo-700 self-end focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded"
                  >
                    Tap for more →
                  </button>
                </div>
              </section>

              {/* Tricky words moved to the Practice page */}
              <section className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Tricky words</h2>
                <p className="text-xs text-gray-500">
                  Practice the words you keep misspelling on the{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/practice')}
                    className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                  >
                    Practice page →
                  </button>
                </p>
              </section>
            </>
          )}
        </div>
      </main>

      {/* AI Language Coach Modal */}
      {coachModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setCoachModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-modal-title"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl md:w-2/3 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 id="coach-modal-title" className="text-lg font-semibold text-gray-900">
                Your AI Coach
              </h2>
              <button
                type="button"
                onClick={() => setCoachModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-left">
              {coachError && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {coachError}{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    className="underline font-medium"
                  >
                    Open AI settings
                  </button>
                </div>
              )}
              {coachLoading && !coachFeedback && !coachError && (
                <p className="text-sm text-gray-600 mb-4">Asking your AI coach…</p>
              )}
              {coachFeedback && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {coachFeedback.summary}
                  </p>
                  {coachFeedback.suggestions?.length > 0 && (
                    <ul className="space-y-3">
                      {coachFeedback.suggestions.map((s, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-700">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-medium">
                            {i + 1}
                          </span>
                          <span>{normalizeSuggestion(s)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Static learning resources recommendations */}
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">
                      Recommended YouTube channels
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      These channels offer clear English audio and high‑quality subtitles, making them ideal for listening, dictation, and Ear2Finger practice.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {
                          name: 'Kurzgesagt – In a Nutshell',
                          href: 'https://www.youtube.com/kurzgesagt',
                        },
                        { name: 'Veritasium', href: 'https://www.youtube.com/veritasium' },
                        { name: 'bald and bankrupt', href: 'https://www.youtube.com/baldandbankrupt' },
                        { name: 'Pick Up Limes', href: 'https://www.youtube.com/pickuplimes' },
                        {
                          name: 'BBC Learning English',
                          href: 'https://www.youtube.com/bbclearningenglish',
                        },
                        {
                          name: "Rachel's English",
                          href: 'https://www.youtube.com/rachelsenglish',
                        },
                        { name: 'Vox', href: 'https://www.youtube.com/@Vox' },
                        { name: 'TED-Ed', href: 'https://www.youtube.com/@TEDEd' },
                        { name: 'TED', href: 'https://www.youtube.com/@TED' },
                      ].map((ch) => (
                        <a
                          key={ch.href}
                          href={ch.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              fill="currentColor"
                              d="M21.8 8.001a3.002 3.002 0 0 0-2.113-2.123C17.938 5.25 12 5.25 12 5.25s-5.938 0-7.687.628A3.002 3.002 0 0 0 2.2 8.001C1.575 9.757 1.575 12.75 1.575 12.75s0 2.993.625 4.749a3.002 3.002 0 0 0 2.113 2.123C6.062 20.25 12 20.25 12 20.25s5.938 0 7.687-.628a3.002 3.002 0 0 0 2.113-2.123c.625-1.756.625-4.749.625-4.749s0-2.993-.625-4.749ZM10.25 15.5v-5l4.5 2.5-4.5 2.5Z"
                            />
                          </svg>
                          <span className="truncate max-w-[10rem]">{ch.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {coachPracticeRecs && coachPracticeRecs.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Recommended YouTube lessons
                  </h3>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {coachPracticeRecs
                      .filter((rec) => rec.youtube_url)
                      .map((rec) => (
                        <li key={`${rec.video_id}-${rec.sentence_id}`}>
                          <a
                            href={rec.youtube_url ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            {rec.video_title || rec.youtube_url}
                          </a>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {coachPracticeError && (
                <p className="mt-2 text-xs text-red-600">
                  {coachPracticeError}
                </p>
              )}
              {!coachLoading && !coachFeedback && !coachError && (
                <p className="text-sm text-gray-600">
                  Personalized tips based on your practice. Connect an AI key in Settings, then
                  tap &ldquo;Ask coach&rdquo; again.
                </p>
              )}
              <div className="mt-4 flex justify-between items-center text-xs text-gray-500">
                <button
                  type="button"
                  onClick={loadCoachFeedback}
                  disabled={coachLoading}
                  className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {coachLoading ? 'Refreshing…' : 'Refresh feedback'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="underline"
                >
                  Configure AI provider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type StatCardProps = {
  label: string
  value: number
  sublabel?: string
}

function StatCard({ label, value, sublabel }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </span>
      <span className="text-2xl font-semibold text-gray-900">
        {value.toLocaleString()}
      </span>
      {sublabel && <span className="mt-1 text-xs text-gray-500">{sublabel}</span>}
    </div>
  )
}

// DifficultyBar previously visualized difficulty distributions, but is currently unused.
