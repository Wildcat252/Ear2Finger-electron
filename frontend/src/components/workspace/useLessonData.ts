import { useState } from 'react'
import { api } from '../../api'
import { useWorkspace } from '../../contexts/WorkspaceContext'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

/**
 * Lesson/playlist data loading, background import, and the transient
 * notification toasts they raise. Playback orchestration stays in Workspace.
 */
export function useLessonData() {
  const {
    setPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    selectedLesson,
    setSelectedLesson,
    setLessons,
    setSentences,
    setSentencesVideoId,
  } = useWorkspace()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isImportInProgress, setIsImportInProgress] = useState(false)

  const fetchPlaylists = async () => {
    try {
      const response = await api.get('/api/playlists')
      setPlaylists(response.data)
      if (response.data.length > 0 && !selectedPlaylistId) {
        setSelectedPlaylistId(response.data[0].id)
      } else if (response.data.length === 0) {
        // Create default playlist if none exists
        const defaultPlaylist = await api.post('/api/playlists', {
          name: 'Default Playlist'
        })
        setPlaylists([defaultPlaylist.data])
        setSelectedPlaylistId(defaultPlaylist.data.id)
      }
    } catch (err) {
      console.error('Error fetching playlists:', err)
    }
  }

  const fetchLessons = async () => {
    if (!selectedPlaylistId) return

    try {
      const response = await api.get(`/api/playlists/${selectedPlaylistId}/videos`)
      const videos = response.data.map((item: {
        id: number
        video_id: number
        title?: string
        duration?: number
        sentence_count?: number
        audio_file_path?: string
        youtube_url?: string
      }) => ({
        id: item.id,
        video_id: item.video_id,
        title: item.title || 'Untitled Video',
        duration: item.duration || 0,
        sentence_count: item.sentence_count || 0,
        audio_file_path: item.audio_file_path,
        youtube_url: item.youtube_url,
        is_favorite: false
      }))
      setLessons(videos)
      if (videos.length > 0 && !selectedLesson) {
        setSelectedLesson(videos[0])
      }
    } catch (err) {
      console.error('Error fetching lessons:', err)
    }
  }

  const pushNotification = (type: Notification['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setNotifications((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((note) => note.id !== id))
    }, 5000)
  }


  const runImportInBackground = async (payload: { playlistId: number; url?: string; title?: string; text?: string }) => {
    setIsImportInProgress(true)
    try {
      let videoId: number
      if (payload.url) {
        const processResponse = await api.post('/api/youtube/process', {
          url: payload.url
        })
        videoId = processResponse.data.video_id
      } else {
        const processResponse = await api.post('/api/youtube/process_text', {
          title: payload.title,
          text: payload.text
        })
        videoId = processResponse.data.video_id
      }
      await api.post(`/api/playlists/${payload.playlistId}/videos/${videoId}`)
      pushNotification('success', 'Import complete. Lesson added to playlist.')
      await fetchPlaylists()
      if (selectedPlaylistId === payload.playlistId) {
        await fetchLessons()
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? null
      pushNotification('error', message || 'Import failed. Please try again.')
    } finally {
      setIsImportInProgress(false)
    }
  }

  const fetchSentences = async (videoId: number) => {
    try {
      const response = await api.get(`/api/youtube/videos/${videoId}/sentences`)
      setSentences(response.data)
      setSentencesVideoId(videoId)
      return response.data as Array<{
        id: number
        sentence_text: string
        start_time: number
        end_time: number
        sentence_index: number
      }>
    } catch (err) {
      console.error('Error fetching sentences:', err)
      return []
    }
  }

  return {
    notifications,
    isImportInProgress,
    pushNotification,
    fetchPlaylists,
    fetchLessons,
    fetchSentences,
    runImportInBackground,
  }
}
