'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// خطاف عام لجلب البيانات من واجهات API مع إمكانية التحديث
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!url) return
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'حدث خطأ غير متوقع')
      }
      if (mounted.current) {
        setData(json as T)
        setError(null)
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'خطأ في الاتصال')
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  return { data, loading, error, refresh, setData }
}

// أداة لاستدعاءات POST/PUT/DELETE
export async function apiCall<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE' | 'GET',
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || json.autoReplyError || 'حدث خطأ غير متوقع')
  }
  return json as T
}
