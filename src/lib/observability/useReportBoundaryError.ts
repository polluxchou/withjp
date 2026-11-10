'use client'
import { useEffect } from 'react'
import { buildClientErrorRecord, reportError } from './report'

/** 错误边界挂上时上报一次（同一个 error 对象只报一次）。 */
export function useReportBoundaryError(boundary: 'admin' | 'site' | 'global', error: unknown) {
  useEffect(() => {
    reportError(buildClientErrorRecord(boundary, error))
  }, [boundary, error])
}
