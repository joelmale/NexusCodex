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
  const [zoom, setZoom] = useState(1)
  const [activeTool, setActiveTool] = useState<'pan' | 'highlight' | 'note' | 'bookmark'>('pan')
  const [loupeEnabled, setLoupeEnabled] = useState(true)
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [loupeState, setLoupeState] = useState<{
    visible: boolean
    x: number
    y: number
    width: number
    height: number
    src: string
  }>({
    visible: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    src: '',
  })

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

  const jumpToPage = (pageNumber: number) => {
    const targetIndex = Math.max(0, Math.min(maxLeftIndex, pageNumber - 1))
    const alignedIndex = targetIndex % 2 === 0 ? targetIndex : Math.max(0, targetIndex - 1)
    setLeftIndex(alignedIndex)
  }

  const toggleBookmark = (pageNumber: number) => {
    setBookmarks((prev) => {
      if (prev.includes(pageNumber)) {
        return prev.filter((num) => num !== pageNumber)
      }
      return [...prev, pageNumber].sort((a, b) => a - b)
    })
  }

  const handlePageClick = (pageNumber?: number) => {
    if (!pageNumber) return
    if (activeTool === 'bookmark') {
      toggleBookmark(pageNumber)
    }
  }

  const zoomIn = () => {
    setZoom((prev) => Math.min(3, Number((prev + 0.2).toFixed(2))))
  }

  const zoomOut = () => {
    setZoom((prev) => Math.max(0.6, Number((prev - 0.2).toFixed(2))))
  }

  const resetZoom = () => {
    setZoom(1)
  }

  const handleLoupeMove = (event: React.MouseEvent, src: string) => {
    if (!loupeEnabled) return
    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    setLoupeState({
      visible: true,
      x,
      y,
      width: rect.width,
      height: rect.height,
      src,
    })
  }

  const handleLoupeLeave = () => {
    setLoupeState((prev) => ({ ...prev, visible: false }))
  }

  const loupeScale = 2.4

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
        <div className="sticky top-4 z-10 flex justify-center mb-4">
          <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-2 shadow-sm">
            <button
              onClick={zoomOut}
              className="px-2 py-1 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
              title="Zoom out"
            >
              Zoom-
            </button>
            <span className="text-xs text-slate-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={zoomIn}
              className="px-2 py-1 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
              title="Zoom in"
            >
              Zoom+
            </button>
            <button
              onClick={resetZoom}
              className="px-2 py-1 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
              title="Reset zoom"
            >
              Reset
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <button
              onClick={() => setLoupeEnabled((prev) => !prev)}
              className={`px-2 py-1 text-sm rounded-md border ${loupeEnabled ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              title="Toggle loupe"
            >
              Loupe
            </button>
            <button
              onClick={() => setActiveTool('pan')}
              className={`px-2 py-1 text-sm rounded-md border ${activeTool === 'pan' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              title="Pan tool"
            >
              Hand
            </button>
            <button
              onClick={() => setActiveTool('highlight')}
              className={`px-2 py-1 text-sm rounded-md border ${activeTool === 'highlight' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              title="Highlight tool"
            >
              Highlight
            </button>
            <button
              onClick={() => setActiveTool('note')}
              className={`px-2 py-1 text-sm rounded-md border ${activeTool === 'note' ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              title="Note tool"
            >
              Note
            </button>
            <button
              onClick={() => setActiveTool('bookmark')}
              className={`px-2 py-1 text-sm rounded-md border ${activeTool === 'bookmark' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              title="Bookmark tool"
            >
              Bookmark
            </button>
          </div>
        </div>

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
              <div
                className={`relative rounded-lg overflow-auto max-h-[75vh] ${activeTool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
                onMouseMove={(event) => handleLoupeMove(event, leftPage.url)}
                onMouseLeave={handleLoupeLeave}
                onClick={() => handlePageClick(leftPage.pageNumber ?? leftIndex + 1)}
              >
                <img
                  src={leftPage.url}
                  alt={`Page ${leftPage.pageNumber ?? leftIndex + 1}`}
                  className="w-full h-auto rounded-lg origin-top-left"
                  style={{ transform: `scale(${zoom})` }}
                />
                {loupeEnabled && loupeState.visible && loupeState.src === leftPage.url && (
                  <div
                    className="pointer-events-none absolute border-2 border-slate-900 rounded-full shadow-lg"
                    style={{
                      width: 180,
                      height: 180,
                      left: loupeState.x - 90,
                      top: loupeState.y - 90,
                      backgroundImage: `url(${loupeState.src})`,
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: `${zoom * loupeScale * 100}%`,
                      backgroundPosition: `${(loupeState.x / loupeState.width) * 100}% ${(loupeState.y / loupeState.height) * 100}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="text-center text-slate-400">No page</div>
            )}
          </div>
          <div className="bg-white shadow-lg rounded-xl p-4">
            {rightPage ? (
              <div
                className={`relative rounded-lg overflow-auto max-h-[75vh] ${activeTool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
                onMouseMove={(event) => handleLoupeMove(event, rightPage.url)}
                onMouseLeave={handleLoupeLeave}
                onClick={() => handlePageClick(rightPage.pageNumber ?? leftIndex + 2)}
              >
                <img
                  src={rightPage.url}
                  alt={`Page ${rightPage.pageNumber ?? leftIndex + 2}`}
                  className="w-full h-auto rounded-lg origin-top-left"
                  style={{ transform: `scale(${zoom})` }}
                />
                {loupeEnabled && loupeState.visible && loupeState.src === rightPage.url && (
                  <div
                    className="pointer-events-none absolute border-2 border-slate-900 rounded-full shadow-lg"
                    style={{
                      width: 180,
                      height: 180,
                      left: loupeState.x - 90,
                      top: loupeState.y - 90,
                      backgroundImage: `url(${loupeState.src})`,
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: `${zoom * loupeScale * 100}%`,
                      backgroundPosition: `${(loupeState.x / loupeState.width) * 100}% ${(loupeState.y / loupeState.height) * 100}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="text-center text-slate-400">End of book</div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm border border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Page Jump</span>
            <span className="text-xs text-slate-400">Bookmarks: {bookmarks.length}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {pages.map((page, index) => {
                const pageNumber = page.pageNumber ?? index + 1
                const isActive = pageNumber === (leftPage?.pageNumber ?? leftIndex + 1) || pageNumber === (rightPage?.pageNumber ?? leftIndex + 2)
                const isBookmarked = bookmarks.includes(pageNumber)
                return (
                  <button
                    key={page.key}
                    onClick={() => jumpToPage(pageNumber)}
                    className={`relative px-2 py-1 rounded-md text-xs border ${
                      isActive ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    title={`Go to page ${pageNumber}`}
                  >
                    {pageNumber}
                    {isBookmarked && (
                      <span className="absolute -top-2 right-1 text-rose-600">🔖</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
