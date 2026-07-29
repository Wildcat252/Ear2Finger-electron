import { useEffect, useState } from 'react'
import {
  api,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  removeVideoFromPlaylist,
  deleteVideo,
  getLessonSessions,
  type LessonSessionRecord,
} from '../../api'
import { useWorkspace, type Lesson } from '../../contexts/WorkspaceContext'

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Playlist selector and lesson list. Owns playlist/lesson mutations and its own
 * menu state; selecting a lesson is handed back to Workspace because that also
 * resets playback and restores session progress.
 */
export function WorkspaceSidebar({
  mobileSidebarOpen,
  sidebarCollapsed,
  onLessonSelect,
  onOpenImport,
  fetchPlaylists,
  fetchLessons,
  pushNotification,
}: {
  mobileSidebarOpen: boolean
  sidebarCollapsed: boolean
  onLessonSelect: (lesson: Lesson) => void
  onOpenImport: () => void
  fetchPlaylists: () => Promise<void>
  fetchLessons: () => Promise<void>
  pushNotification: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const {
    playlists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    lessons,
    setLessons,
    selectedLesson,
    setSelectedLesson,
    setSentences,
    setSentencesVideoId,
  } = useWorkspace()

  const [lessonMenuOpen, setLessonMenuOpen] = useState<number | null>(null)
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false)
  const [lessonProgress, setLessonProgress] = useState<Record<number, number>>({})

  // Preload most recent lesson history per video to drive sidebar progress bars.
  useEffect(() => {
    if (!lessons.length) return
    const missingIds = lessons
      .map((l) => l.video_id)
      .filter((id) => lessonProgress[id] === undefined)
    if (!missingIds.length) return

      ; (async () => {
        await Promise.all(
          missingIds.map(async (videoId) => {
            try {
              const sessions = await getLessonSessions(videoId)
              const latest = sessions[0] as LessonSessionRecord | undefined
              const sentences = latest?.sentences_practiced ?? 0
              setLessonProgress((prev) => (prev[videoId] === undefined ? { ...prev, [videoId]: sentences } : prev))
            } catch {
              // ignore per-video errors
            }
          })
        )
      })()
  }, [lessons, lessonProgress])

  const handleNewPlaylist = async () => {
    const name = window.prompt('New playlist name:', 'My Playlist')
    if (!name?.trim()) return
    try {
      const created = await createPlaylist(name.trim())
      await fetchPlaylists()
      setSelectedPlaylistId(created.id)
      pushNotification('success', 'Playlist created.')
    } catch (err) {
      pushNotification('error', 'Failed to create playlist.')
    }
  }

  const handleRenamePlaylist = async () => {
    if (!selectedPlaylistId) return
    const playlist = playlists.find((p) => p.id === selectedPlaylistId)
    const name = window.prompt('Rename playlist:', playlist?.name ?? '')
    if (!name?.trim()) return
    try {
      await updatePlaylist(selectedPlaylistId, name.trim())
      await fetchPlaylists()
      pushNotification('success', 'Playlist renamed.')
    } catch (err) {
      pushNotification('error', 'Failed to rename playlist.')
    }
  }

  const handleDeletePlaylist = async () => {
    if (!selectedPlaylistId) return
    if (!window.confirm('Delete this playlist? Lessons will not be deleted.')) return
    try {
      await deletePlaylist(selectedPlaylistId)
      await fetchPlaylists()
      setSelectedPlaylistId(playlists.length > 1 ? playlists.find((p) => p.id !== selectedPlaylistId)?.id ?? null : null)
      setSelectedLesson(null)
      setLessons([])
      pushNotification('success', 'Playlist deleted.')
    } catch (err) {
      pushNotification('error', 'Failed to delete playlist.')
    }
  }

  const handleRemoveFromPlaylist = async (lesson: Lesson) => {
    if (!selectedPlaylistId) return
    if (!window.confirm(`Remove "${lesson.title}" from this playlist?`)) return
    try {
      await removeVideoFromPlaylist(selectedPlaylistId, lesson.video_id)
      await fetchLessons()
      if (selectedLesson?.video_id === lesson.video_id) {
        setSelectedLesson(null)
        setSentences([])
        setSentencesVideoId(null)
      }
      pushNotification('success', 'Removed from playlist.')
    } catch (err) {
      pushNotification('error', 'Failed to remove.')
    }
    setLessonMenuOpen(null)
  }

  const handleMoveLessonToPlaylist = async (lesson: Lesson, targetPlaylistId: number) => {
    if (!selectedPlaylistId || targetPlaylistId === selectedPlaylistId) return
    try {
      await api.post(`/api/playlists/${targetPlaylistId}/videos/${lesson.video_id}`)
      await removeVideoFromPlaylist(selectedPlaylistId, lesson.video_id)
      await fetchLessons()
      if (selectedLesson?.video_id === lesson.video_id) {
        setSelectedLesson(null)
        setSentences([])
        setSentencesVideoId(null)
      }
      pushNotification('success', 'Lesson moved to playlist.')
    } catch (err) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? null
      pushNotification('error', message || 'Failed to move lesson.')
    } finally {
      setLessonMenuOpen(null)
    }
  }

  const handleDeleteLesson = async (lesson: Lesson) => {
    if (!window.confirm(`Delete "${lesson.title}"? It will be removed from all playlists. Your learning data will be preserved for analysis.`)) return
    try {
      await deleteVideo(lesson.video_id)
      await fetchPlaylists()
      await fetchLessons()
      if (selectedLesson?.video_id === lesson.video_id) {
        setSelectedLesson(null)
        setSentences([])
        setSentencesVideoId(null)
      }
      pushNotification('success', 'Lesson removed. Learning data preserved.')
    } catch (err) {
      pushNotification('error', 'Failed to delete lesson.')
    }
    setLessonMenuOpen(null)
  }

  const handleOpenYoutubeForLesson = (lesson: Lesson) => {
    if (!lesson.youtube_url) {
      pushNotification('error', 'Original YouTube link is not available for this lesson.')
      return
    }
    window.open(lesson.youtube_url, '_blank', 'noopener,noreferrer')
    setLessonMenuOpen(null)
  }

  return (
        <aside
          id="workspace-lessons-sidebar"
          className={`w-full md:w-80 shrink-0 max-md:max-h-[min(55vh,440px)] md:max-h-none bg-gray-50 border-gray-200 border-b md:border-b-0 md:border-r flex flex-col min-h-0 ${!mobileSidebarOpen ? 'max-md:hidden' : ''
            } ${sidebarCollapsed ? 'md:hidden' : ''}`}
        >
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-1">
              <div className="relative flex-1 min-w-0">
                <select
                  value={selectedPlaylistId || ''}
                  onChange={(e) => setSelectedPlaylistId(Number(e.target.value))}
                  className="w-full appearance-none bg-white rounded-lg border border-gray-200 px-3 py-2 pr-8 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPlaylistMenuOpen(!playlistMenuOpen)
                  }}
                  className="p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Playlist menu"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {playlistMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 z-10 py-1 bg-white border border-gray-200 rounded-lg shadow-lg text-left min-w-[160px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleNewPlaylist()
                        setPlaylistMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                    >
                      New playlist
                    </button>
                    {selectedPlaylistId && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            handleRenamePlaylist()
                            setPlaylistMenuOpen(false)
                          }}
                          className="block w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDeletePlaylist()
                            setPlaylistMenuOpen(false)
                          }}
                          className="block w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                        >
                          Delete playlist
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {lessons.map((lesson) => {
              const practicedSentences = lessonProgress[lesson.video_id] ?? 0
              const totalSentences = lesson.sentence_count || 0
              const progressFraction =
                totalSentences > 0 ? Math.max(0, Math.min(1, practicedSentences / totalSentences)) : 0
              const progressPercent = progressFraction * 100

              return (
                <div
                  key={lesson.id}
                  className={`relative p-4 rounded-lg cursor-pointer transition-colors group ${selectedLesson?.id === lesson.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white hover:bg-gray-100'
                    }`}
                  onClick={() => onLessonSelect(lesson)}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLessonMenuOpen(lessonMenuOpen === lesson.id ? null : lesson.id)
                    }}
                    className={`absolute top-2 right-2 p-1 rounded opacity-70 hover:opacity-100 ${selectedLesson?.id === lesson.id ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200'
                      }`}
                    aria-label="Lesson menu"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {lessonMenuOpen === lesson.id && (
                    <div
                      className="absolute right-2 top-10 z-10 py-1 bg-white border border-gray-200 rounded-lg shadow-lg text-left min-w-[200px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveFromPlaylist(lesson)}
                        className="block w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                      >
                        Remove from this playlist
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLesson(lesson)}
                        className="block w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                      >
                        Delete lesson
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenYoutubeForLesson(lesson)}
                        className="block w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                      >
                        Open original YouTube video
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <div className="px-3 py-1 text-[11px] font-medium text-gray-500">
                        Move to playlist
                      </div>
                      {playlists.filter((p) => p.id !== selectedPlaylistId).length === 0 ? (
                        <div className="px-3 py-1 text-xs text-gray-400">
                          No other playlists
                        </div>
                      ) : (
                        playlists
                          .filter((p) => p.id !== selectedPlaylistId)
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleMoveLessonToPlaylist(lesson, p.id)}
                              className="block w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 text-left"
                            >
                              {p.name}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                  <div className="space-y-1 pr-6">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={`text-sm font-medium leading-snug line-clamp-2 text-left ${selectedLesson?.id === lesson.id ? 'text-white' : 'text-gray-900'
                          }`}
                      >
                        {lesson.title}
                      </h3>
                      {lesson.is_favorite && (
                        <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                    </div>
                    <div
                      className={`flex justify-between text-[11px] ${selectedLesson?.id === lesson.id ? 'text-gray-300' : 'text-gray-600'
                        }`}
                    >
                      <span className="truncate">Duration: {formatDuration(lesson.duration)}</span>
                      <span className="ml-2 whitespace-nowrap">
                        Sentences: {lesson.sentence_count}
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progressFraction >= 1
                          ? 'bg-emerald-500'
                          : 'bg-indigo-500'
                          }`}
                        style={{ width: `${progressPercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={() => onOpenImport()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Import Lesson
            </button>
          </div>
        </aside>
  )
}
