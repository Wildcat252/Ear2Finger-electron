import { useEffect, useImperativeHandle, useState, forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getCoachFeedback,
  getCoachRecommendations,
  type CoachFeedbackResponse,
  type PracticeRecommendationItem,
} from '../../api'
import { useWorkspace } from '../../contexts/WorkspaceContext'

export interface CoachDrawerHandle {
  /** Open the drawer and load feedback for a video (used by the "Ask coach" button). */
  openForVideo: (videoId: number | null) => void
}

/**
 * AI coach side panel: lesson recap and practice recommendations. Owns its own
 * state; opens automatically when a lesson is finished, or on demand via the
 * imperative handle.
 */
export const CoachDrawer = forwardRef<CoachDrawerHandle, { isLessonFinished: boolean }>(
  function CoachDrawer({ isLessonFinished }, ref) {
    const navigate = useNavigate()
    const { selectedLesson } = useWorkspace()

    const [coachPanelOpen, setCoachPanelOpen] = useState(false)
    const [coachLoading, setCoachLoading] = useState(false)
    const [coachError, setCoachError] = useState<string | null>(null)
    const [coachFeedback, setCoachFeedback] = useState<CoachFeedbackResponse | null>(null)
    const [practiceLoading, setPracticeLoading] = useState(false)
    const [practiceError, setPracticeError] = useState<string | null>(null)
    const [practiceRecommendations, setPracticeRecommendations] = useState<
      PracticeRecommendationItem[] | null
    >(null)
    const [coachShownForVideoId, setCoachShownForVideoId] = useState<number | null>(null)

    const loadCoachFeedbackForVideo = (videoId: number | null) => {
      if (!videoId) return
      setCoachLoading(true)
      setCoachError(null)
      setCoachPanelOpen(true)
      getCoachFeedback({ video_id: videoId })
        .then((data) => {
          setCoachFeedback(data)
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

    const loadPracticeRecommendationsForVideo = (videoId: number | null) => {
      if (!videoId) return
      setPracticeLoading(true)
      setPracticeError(null)
      getCoachRecommendations({ video_id: videoId, limit: 6 })
        .then((data) => {
          setPracticeRecommendations(data.recommendations ?? [])
        })
        .catch((e) => {
          const err = e as { response?: { data?: { detail?: string } } }
          setPracticeError(
            err.response?.data?.detail ||
            'Practice recommendations are temporarily unavailable. Try again later.'
          )
        })
        .finally(() => setPracticeLoading(false))
    }

    useEffect(() => {
      const videoId = selectedLesson?.video_id ?? null
      if (!videoId || !isLessonFinished) return
      if (coachShownForVideoId === videoId) return
      setCoachShownForVideoId(videoId)
      setCoachLoading(true)
      setCoachError(null)
      setCoachPanelOpen(true)
      getCoachFeedback({ video_id: videoId })
        .then((data) => {
          setCoachFeedback(data)
        })
        .catch((e) => {
          const err = e as { response?: { data?: { detail?: string } } }
          setCoachError(
            err.response?.data?.detail ||
            'AI coach is unavailable. Check your AI API key in Settings.'
          )
        })
        .finally(() => setCoachLoading(false))
    }, [selectedLesson?.video_id, isLessonFinished, coachShownForVideoId])
    useImperativeHandle(ref, () => ({ openForVideo: loadCoachFeedbackForVideo }))

    if (!coachPanelOpen) return null

    return (
          <div className="fixed inset-x-3 bottom-20 md:inset-x-auto md:right-4 md:bottom-24 z-50 w-auto md:w-[26rem] max-h-[min(55vh,480px)] md:max-h-[60vh] rounded-lg border border-gray-200 bg-white shadow-xl flex flex-col text-left">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Session recap by AI coach</h2>
                {selectedLesson && (
                  <p className="text-[11px] text-gray-500 truncate">
                    {selectedLesson.title}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCoachPanelOpen(false)}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-3 py-2 text-xs text-gray-600 border-b border-gray-100 text-left">
              AI feedback based on your current practice stats for this video.
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-sm text-left">
              {coachError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
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
                <p className="text-sm text-gray-600">Asking your AI coach…</p>
              )}
              {coachFeedback && (
                <>
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {coachFeedback.summary}
                  </p>
                  {coachFeedback.suggestions?.length > 0 && (
                    <ul className="space-y-2">
                      {coachFeedback.suggestions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-700">
                          <span className="mt-0.5 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-medium">
                            {i + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {!coachLoading && !coachFeedback && !coachError && (
                <p className="text-sm text-gray-600">
                  Connect an AI key in Settings and click &ldquo;Ask coach&rdquo; to see personalized
                  tips for this session.
                </p>
              )}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  type="button"
                  disabled={!selectedLesson || coachLoading}
                  onClick={() => selectedLesson && loadCoachFeedbackForVideo(selectedLesson.video_id)}
                  className="w-full inline-flex items-center justify-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {coachLoading ? 'Refreshing…' : 'Refresh recap'}
                </button>
                <button
                  type="button"
                  disabled={!selectedLesson || practiceLoading}
                  onClick={() =>
                    selectedLesson && loadPracticeRecommendationsForVideo(selectedLesson.video_id)
                  }
                  className="w-full inline-flex items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {practiceLoading ? 'Finding practice sentences…' : 'View practice recommendations'}
                </button>
                {practiceError && (
                  <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                    {practiceError}
                  </div>
                )}
                {practiceRecommendations && practiceRecommendations.length > 0 && (
                  <div className="space-y-2">
                    {practiceRecommendations.map((rec) => (
                      <div
                        key={`${rec.video_id}-${rec.sentence_id}-${rec.start_time}`}
                        className="border border-gray-100 rounded-md px-2 py-1.5 bg-gray-50/60"
                      >
                        <div className="text-xs font-medium text-gray-800 line-clamp-2">
                          {rec.sentence_text}
                        </div>
                        <div className="mt-0.5 flex justify-between items-center text-[11px] text-gray-500">
                          <span className="truncate">
                            {rec.video_title || 'Video'} · {Math.round(rec.start_time)}s–
                            {Math.round(rec.end_time)}s
                          </span>
                          <span className="ml-2 text-[10px] text-indigo-600">
                            Score {rec.score.toFixed(2)}
                          </span>
                        </div>
                        {rec.reasons?.length > 0 && (
                          <ul className="mt-1 text-[11px] text-gray-600 list-disc list-inside space-y-0.5">
                            {rec.reasons.map((r, idx) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
    )
  }
)
