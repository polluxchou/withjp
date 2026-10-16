'use client'

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { MAX_VENUE_VIEW_BOOKMARKS, type VenueViewBookmark } from '@/venue/layoutData'
import { appendBookmark, removeBookmark, replaceBookmark } from '@/lib/venue/editor'

// 视角书签:记下/覆盖/删除当前缩放 + 滚动位置,并能一键恢复。书签本身存在
// layout 上(由 updateBookmarks 写入),这里只管取快照与恢复滚动。
export function useViewBookmarks({
  bookmarks,
  zoom,
  setZoom,
  scrollerRef,
  updateBookmarks,
}: {
  bookmarks: VenueViewBookmark[]
  zoom: number
  setZoom: Dispatch<SetStateAction<number>>
  scrollerRef: RefObject<HTMLDivElement | null>
  updateBookmarks: (updater: (prev: VenueViewBookmark[]) => VenueViewBookmark[]) => void
}) {
  // Bumped on every recall so the apply-scroll effect runs even when zoom is unchanged.
  const [recallTick, setRecallTick] = useState(0)
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)

  // After a bookmark recall sets the zoom (and the canvas resizes), restore the
  // saved scroll offset on the next frame.
  useEffect(() => {
    if (!pendingScrollRef.current) return
    const target = pendingScrollRef.current
    pendingScrollRef.current = null
    const id = requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      if (scroller) {
        scroller.scrollLeft = target.left
        scroller.scrollTop = target.top
      }
    })
    return () => cancelAnimationFrame(id)
  }, [recallTick, scrollerRef])

  function currentViewSnapshot(): VenueViewBookmark | null {
    const scroller = scrollerRef.current
    if (!scroller) return null
    return { zoom, left: scroller.scrollLeft, top: scroller.scrollTop }
  }

  function add() {
    const snapshot = currentViewSnapshot()
    if (!snapshot) return
    updateBookmarks((prev) => appendBookmark(prev, snapshot, MAX_VENUE_VIEW_BOOKMARKS))
  }

  function overwrite(index: number) {
    const snapshot = currentViewSnapshot()
    if (!snapshot) return
    updateBookmarks((prev) => replaceBookmark(prev, index, snapshot))
  }

  function remove(index: number) {
    updateBookmarks((prev) => removeBookmark(prev, index))
  }

  function recall(index: number) {
    const bookmark = bookmarks[index]
    if (!bookmark) return
    pendingScrollRef.current = { left: bookmark.left, top: bookmark.top }
    setZoom(bookmark.zoom)
    setRecallTick((tick) => tick + 1)
  }

  return { add, overwrite, remove, recall }
}
