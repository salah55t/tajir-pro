'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiCall, useFetch } from '@/hooks/use-fetch'
import { formatRelative, type Customer, type Message } from '@/lib/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  Bot, Loader2, MessageCircle, MessageSquare, Phone, RefreshCw, Search, Send, Sparkles, UserPlus, Users,
} from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
}

const SAMPLE_INCOMING = [
  'السلام عليكم، هل عندكم مخزون جديد هذا الأسبوع؟',
  'متى يوصل طلبي؟ أنتظرت منذ يومين',
  'كم سعر القهوة بون 250 غرام؟ وهل تتوفر؟',
  'هل توصلون لعنابة؟ وكم رسوم التوصيل؟',
  'شكراً، خدمتكم ممتازة والطلب وصل بسرعة',
]

const QUICK_REPLIES = [
  'شكراً لتواصلك معنا، سنعالج طلبك فوراً.',
  'التوصيل متوفر لجميع الولايات، والرسوم تبدأ من 350 دج.',
  'سنتحقق من المخزون ونؤكد لك التوفر خلال دقائق.',
]

export default function MessagesTab({ version, onChanged }: Props) {
  const { data: customers, loading: loadingCustomers } = useFetch<Customer[]>(`/api/customers?v=${version}`)
  const { toast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<{ text: string; forMessageId: string } | null>(null)
  const [simulating, setSimulating] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: messages, loading: loadingMessages, refresh: refreshMessages } = useFetch<Message[]>(
    selectedId ? `/api/messages?customerId=${selectedId}&v=${version}` : null
  )

  // تحديث دوري للرسائل كل 8 ثوانٍ (محاكاة استقبال حي)
  useEffect(() => {
    if (!selectedId) return
    const t = setInterval(refreshMessages, 8000)
    return () => clearInterval(t)
  }, [selectedId, refreshMessages])

  // اختيار أول عميل تلقائياً
  useEffect(() => {
    if (!selectedId && customers && customers.length > 0) {
      const t = setTimeout(() => setSelectedId(customers[0].id), 0)
      return () => clearTimeout(t)
    }
  }, [customers, selectedId])

  // تمرير لآخر رسالة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const filteredCustomers = useMemo(() => {
    const list = customers || []
    const needle = query.trim().toLowerCase()
    if (!needle) return list
    return list.filter((c) => c.name.toLowerCase().includes(needle) || c.phone.includes(needle))
  }, [customers, query])

  const selectedCustomer = useMemo(
    () => customers?.find((c) => c.id === selectedId) || null,
    [customers, selectedId]
  )

  const lastIncoming = useMemo(() => {
    if (!messages) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === 'incoming') return messages[i]
    }
    return null
  }, [messages])

  const sendOutgoing = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || !selectedId) return
    setSending(true)
    try {
      await apiCall('/api/messages', 'POST', { customerId: selectedId, content, direction: 'outgoing' })
      setInput('')
      setAiSuggestion(null)
      await refreshMessages()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const generateSuggestion = async () => {
    if (!lastIncoming) {
      toast({ title: 'لا توجد رسالة واردة للرد عليها', description: 'استلم رسالة من العميل أولاً.' })
      return
    }
    setAiLoading(true)
    setAiSuggestion(null)
    try {
      const res = await apiCall<{ suggestion: string }>('/api/ai-reply', 'POST', { messageId: lastIncoming.id })
      setAiSuggestion({ text: res.suggestion, forMessageId: lastIncoming.id })
    } catch (e) {
      toast({ title: 'تعذر توليد الرد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // محاكاة وصول رسالة من العميل — تختبر الرد الآلي فعلياً
  const simulateIncoming = async () => {
    if (!selectedId) return
    setSimulating(true)
    const content = SAMPLE_INCOMING[Math.floor(Math.random() * SAMPLE_INCOMING.length)]
    try {
      const res = await apiCall<{ autoReply?: Message; autoReplyError?: string }>('/api/messages', 'POST', {
        customerId: selectedId,
        content,
        direction: 'incoming',
      })
      await refreshMessages()
      onChanged()
      if (res.autoReply) {
        toast({
          title: 'وصلت رسالة من العميل وردّ المساعد الذكي فوراً',
          description: `«${content.slice(0, 60)}${content.length > 60 ? '…' : ''}»`,
        })
        setTimeout(() => refreshMessages(), 300)
      } else {
        toast({
          title: 'وصلت رسالة من العميل',
          description: res.autoReplyError || 'الرد الآلي متوقف — رُدّ يدوياً أو فعّله من الرأس.',
        })
      }
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] min-h-[60vh]">
      {/* قائمة العملاء */}
      <Card className="border-0 shadow-soft ring-1 ring-border/60 self-start w-full">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="font-bold text-sm flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> العملاء</h3>
            <Badge variant="secondary" className="tabular">{customers?.length ?? 0}</Badge>
          </div>
          <div className="relative mb-2">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن عميل…"
              className="h-8 ps-8 text-sm"
            />
          </div>
          {loadingCustomers && !customers ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {query ? 'لا يوجد عميل مطابق.' : 'لا يوجد عملاء بعد. أضف عملاء من تبويب الطلبات.'}
            </div>
          ) : (
            <ul className="space-y-1 max-h-[65vh] overflow-y-auto custom-scrollbar pe-1">
              {filteredCustomers.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => { setSelectedId(c.id); setAiSuggestion(null) }}
                    className={`w-full text-start rounded-xl px-3 py-2.5 transition-colors flex items-center gap-2.5 ${
                      selectedId === c.id ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-accent/60'
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono" dir="ltr">{c.phone}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* المحادثة */}
      <Card className="border-0 shadow-soft ring-1 ring-border/60 flex flex-col">
        {selectedCustomer ? (
          <>
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                {selectedCustomer.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm">{selectedCustomer.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /><span dir="ltr" className="font-mono">{selectedCustomer.phone}</span>
                </div>
              </div>
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={simulateIncoming} disabled={simulating}
                title="يحاكي وصول رسالة جديدة من العميل لاختبار الرد الآلي"
              >
                {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">محاكاة رسالة واردة</span>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refreshMessages} aria-label="تحديث">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* الرسائل */}
            <div ref={scrollRef} className="flex-1 min-h-[300px] max-h-[52vh] overflow-y-auto custom-scrollbar p-4 space-y-3 bg-muted/20">
              {loadingMessages && !messages ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className={`h-12 rounded-2xl ${i % 2 ? 'ms-auto' : ''} w-2/3`} />)}
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm py-10">
                  <MessageSquare className="h-9 w-9 mx-auto mb-2 opacity-40" />
                  لا توجد رسائل مع هذا العميل بعد.
                  <span className="text-xs mt-1">استخدم «محاكاة رسالة واردة» لتجربة الرد الآلي.</span>
                </div>
              ) : (
                messages.map((m) => {
                  const isIncoming = m.direction === 'incoming'
                  return (
                    <div key={m.id} className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                          isIncoming
                            ? 'bg-card border rounded-ss-sm'
                            : 'bg-primary text-primary-foreground rounded-se-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        <div className={`flex items-center gap-1.5 mt-1 text-[10px] ${isIncoming ? 'text-muted-foreground' : 'text-primary-foreground/80'}`}>
                          <span>{formatRelative(m.createdAt)}</span>
                          {m.isAuto && m.deliveredBy === 'ai' && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-300 text-emerald-700 bg-white/70 dark:bg-transparent dark:text-emerald-300 dark:border-emerald-500/40">
                              <Bot className="h-2.5 w-2.5 me-0.5" /> رد آلي
                            </Badge>
                          )}
                          {m.isAuto && m.deliveredBy === 'system' && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-teal-300 text-teal-700 bg-white/70 dark:bg-transparent dark:text-teal-300 dark:border-teal-500/40">
                              إشعار نظام
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* الاقتراح الذكي */}
            {(aiLoading || aiSuggestion) && (
              <div className="border-t bg-primary/5 px-4 py-3">
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    المساعد الذكي يحلل سياق العميل والمخزون والطلبات…
                  </div>
                ) : aiSuggestion && (
                  <>
                    <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> رد مقترح بالذكاء الاصطناعي — راجعه وعدّله ثم أرسل
                    </div>
                    <Textarea
                      value={aiSuggestion.text}
                      onChange={(e) => setAiSuggestion({ ...aiSuggestion, text: e.target.value })}
                      rows={3}
                      className="bg-card text-sm"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" onClick={() => sendOutgoing(aiSuggestion.text)} disabled={sending} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> إرسال الرد
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAiSuggestion(null)}>تجاهل</Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ردود سريعة */}
            <div className="border-t px-3 pt-2.5 flex gap-1.5 overflow-x-auto custom-scrollbar">
              {QUICK_REPLIES.map((r) => (
                <button
                  key={r}
                  onClick={() => setInput(r)}
                  className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {r.length > 34 ? `${r.slice(0, 34)}…` : r}
                </button>
              ))}
            </div>

            {/* صندوق الإرسال */}
            <div className="border-t p-3 flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOutgoing() } }}
                placeholder="اكتب رسالتك للعميل…"
                className="flex-1"
              />
              <Button
                variant="outline" size="icon" className="h-10 w-10 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                onClick={generateSuggestion} disabled={aiLoading}
                title="اقترح رداً بالذكاء الاصطناعي"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
              <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => sendOutgoing()} disabled={sending || !input.trim()} aria-label="إرسال">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <CardContent className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">اختر عميلاً لعرض المحادثة</p>
            <p className="text-sm">الرد الآلي يجيب على رسائل العملاء تلقائياً عند تفعيله من الرأس.</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
