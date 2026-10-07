'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// خطاف عام لجلب البيانات من واجهات API مع إمكانية التحديث
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)

  // آخر طلب بدأ — لتجاهل النتائج المتأخرة عند تغيّر الرابط بسرعة
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    if (!url) return
    const current = ++requestId.current
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (current !== requestId.current) return
      if (!res.ok) {
        throw new Error(json.error || 'حدث خطأ غير متوقع')
      }
      setData(json as T)
      setError(null)
    } catch (e) {
      if (current !== requestId.current) return
      setError(e instanceof Error ? e.message : 'خطأ في الاتصال')
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    if (!url) return
    let active = true
    const load = async () => {
      setLoading(true)
      await refresh()
      if (!active) return
    }
    load()
    return () => {
      active = false
    }
  }, [url, refresh])

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
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json.error || json.autoReplyError || 'حدث خطأ غير متوقع')
  }
  return json as T
}
