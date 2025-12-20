import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

interface PageImage {
  key: string
  url: string
  pageNumber: number | null
}

interface PageImagesResponse {
  documentId: string
  title: string
  count: number
  pages: PageImage[]
}

export default function Reader() {
  const { id } = useParams()
  const [data, setData] = useState<PageImagesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [leftIndex, setLeftIndex] = useState(0)

  useEffect(() => {
    if (!id) return
    let isMounted = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/documents/${id}/page-images`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load page images')
        }
        if (isMounted) {
          setData(payload)
          setLeftIndex(0)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load reader')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [id])

  const pages = data?.pages || []
  const maxLeftIndex = useMemo(() => {
    if (pages.length === 0) return 0
    return pages.length % 2 === 0 ? pages.length - 2 : pages.length - 1
  }, [pages.length])

  const leftPage = pages[leftIndex]
  const rightPage = pages[leftIndex + 1]

  const goPrev = () => {
    setLeftIndex((prev) => Math.max(0, prev - 2))
  }

  const goNext = () => {
    setLeftIndex((prev) => Math.min(maxLeftIndex, prev + 2))
  }

  if (loading) {
    return <div className="p-6">Loading reader...</div>
  }

  if (error) {
    return <div className="p-6 text-red-600">Reader error: {error}</div>
  }

  if (!data || pages.length === 0) {
    return <div className="p-6">No page images available for this document.</div>
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{data.title}</h1>
            <p className="text-sm text-slate-500">
              Pages {leftPage?.pageNumber ?? leftIndex + 1}
              {rightPage ? `–${rightPage.pageNumber ?? leftIndex + 2}` : ''} of {pages.length}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={goPrev}
              disabled={leftIndex === 0}
              className="px-4 py-2 rounded-md bg-white border border-slate-300 text-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={goNext}
              disabled={leftIndex >= maxLeftIndex}
              className="px-4 py-2 rounded-md bg-slate-900 text-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white shadow-lg rounded-xl p-4">
            {leftPage ? (
              <img
                src={leftPage.url}
                alt={`Page ${leftPage.pageNumber ?? leftIndex + 1}`}
                className="w-full h-auto rounded-lg"
              />
            ) : (
              <div className="text-center text-slate-400">No page</div>
            )}
          </div>
          <div className="bg-white shadow-lg rounded-xl p-4">
            {rightPage ? (
              <img
                src={rightPage.url}
                alt={`Page ${rightPage.pageNumber ?? leftIndex + 2}`}
                className="w-full h-auto rounded-lg"
              />
            ) : (
              <div className="text-center text-slate-400">End of book</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
