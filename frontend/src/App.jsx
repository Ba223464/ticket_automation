import { useEffect, useMemo, useRef, useState } from 'react'

const TOKEN_KEY = 'ta_access'
const REFRESH_KEY = 'ta_refresh'

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL
}

function getWsBaseUrl() {
  return import.meta.env.VITE_WS_BASE_URL
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

async function apiFetch(path, { method = 'GET', token, body, onAuthRefresh } = {}) {
  const baseUrl = getApiBaseUrl()
  const doFetch = async (accessToken) => {
    const headers = {}

    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const text = await res.text()
    const data = text ? safeJsonParse(text) : null

    return { res, text, data }
  }

  const first = await doFetch(token)

  if (first.res.status === 401) {
    const refresh = localStorage.getItem(REFRESH_KEY) || ''
    if (refresh) {
      try {
        const refreshRes = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        })

        const refreshText = await refreshRes.text()
        const refreshData = refreshText ? safeJsonParse(refreshText) : null

        if (refreshRes.ok && refreshData?.access) {
          localStorage.setItem(TOKEN_KEY, refreshData.access)
          if (onAuthRefresh) onAuthRefresh(refreshData.access)
          const second = await doFetch(refreshData.access)
          if (!second.res.ok) {
            const detail =
              (second.data && (second.data.detail || second.data.message)) ||
              second.text ||
              `HTTP ${second.res.status}`
            const err = new Error(detail)
            err.status = second.res.status
            err.data = second.data
            throw err
          }
          return second.data
        }
      } catch {
        // fallthrough to error handling below
      }

      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)

      const err = new Error('Session expired')
      err.status = 401
      throw err
    }
  }

  if (!first.res.ok) {
    const detail = (first.data && (first.data.detail || first.data.message)) || first.text || `HTTP ${first.res.status}`
    const err = new Error(detail)
    err.status = first.res.status
    err.data = first.data
    throw err
  }

  return first.data
}

const UI = {
  colors: {
    bg: '#0b1220',
    surface: 'rgba(255,255,255,0.06)',
    surface2: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.10)',
    text: '#e5e7eb',
    muted: 'rgba(229,231,235,0.72)',
    primary: '#60a5fa',
    primaryBg: 'rgba(96,165,250,0.16)',
    danger: '#f87171',
    success: '#34d399',
    warning: '#fbbf24',
  },
  radius: 14,
}

function Button({ children, variant = 'primary', style, ...props }) {
  const base = {
    appearance: 'none',
    border: `1px solid ${UI.colors.border}`,
    borderRadius: 12,
    padding: '10px 12px',
    fontWeight: 650,
    color: UI.colors.text,
    background: UI.colors.surface,
    cursor: 'pointer',
    transition: 'transform 80ms ease, background 120ms ease, border-color 120ms ease',
  }

  const variants = {
    primary: {
      background: UI.colors.primaryBg,
      borderColor: 'rgba(96,165,250,0.35)',
    },
    ghost: {
      background: 'transparent',
    },
    danger: {
      background: 'rgba(248,113,113,0.14)',
      borderColor: 'rgba(248,113,113,0.35)',
    },
  }

  return (
    <button
      {...props}
      style={{
        ...base,
        ...(variants[variant] || {}),
        ...style,
      }}
      onMouseDown={(e) => {
        try {
          e.currentTarget.style.transform = 'scale(0.99)'
        } catch {
          // ignore
        }
        props.onMouseDown?.(e)
      }}
      onMouseUp={(e) => {
        try {
          e.currentTarget.style.transform = 'none'
        } catch {
          // ignore
        }
        props.onMouseUp?.(e)
      }}
    >
      {children}
    </button>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {label ? <div style={{ fontSize: 12, color: UI.colors.muted, fontWeight: 650 }}>{label}</div> : null}
      {children}
      {hint ? <div style={{ fontSize: 12, color: UI.colors.muted }}>{hint}</div> : null}
    </div>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: 'rgba(0,0,0,0.15)',
        color: UI.colors.text,
        outline: 'none',
        ...(props.style || {}),
      }}
    />
  )
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: 'rgba(0,0,0,0.15)',
        color: UI.colors.text,
        outline: 'none',
        resize: 'vertical',
        ...(props.style || {}),
      }}
    />
  )
}

function Select(props) {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: 'rgba(0,0,0,0.15)',
        color: UI.colors.text,
        outline: 'none',
        ...(props.style || {}),
      }}
    />
  )
}

function StatusPill({ status }) {
  const bg =
    status === 'OPEN'
      ? 'rgba(96,165,250,0.18)'
      : status === 'ASSIGNED'
        ? 'rgba(34,211,238,0.16)'
        : status === 'IN_PROGRESS'
          ? 'rgba(251,191,36,0.14)'
          : status === 'WAITING_ON_CUSTOMER'
            ? 'rgba(167,139,250,0.16)'
            : status === 'RESOLVED'
              ? 'rgba(52,211,153,0.14)'
              : 'rgba(255,255,255,0.08)'

  const fg = UI.colors.text

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 12,
        border: `1px solid ${UI.colors.border}`,
      }}
    >
      {status}
    </span>
  )
}

function Card({ children }) {
  return (
    <div
      style={{
        background: UI.colors.surface,
        border: `1px solid ${UI.colors.border}`,
        borderRadius: UI.radius,
        padding: 16,
        boxShadow: '0 10px 30px rgba(0,0,0,0.30)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {children}
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState('loading...')
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem(REFRESH_KEY) || '')
  const [user, setUser] = useState(null)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [registerUsername, setRegisterUsername] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerError, setRegisterError] = useState('')

  const [tickets, setTickets] = useState([])
  const [ticketsError, setTicketsError] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketSearchLoading, setTicketSearchLoading] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [messages, setMessages] = useState([])

  const [newTicketSubject, setNewTicketSubject] = useState('')
  const [newTicketDescription, setNewTicketDescription] = useState('')
  const [newTicketPriority, setNewTicketPriority] = useState('MEDIUM')

  const [newMessage, setNewMessage] = useState('')
  const [newMessageInternal, setNewMessageInternal] = useState(false)

  const [aiDraft, setAiDraft] = useState('')
  const [aiDraftLoading, setAiDraftLoading] = useState(false)
  const [aiDraftError, setAiDraftError] = useState('')

  const [availability, setAvailability] = useState(null)
  const wsRef = useRef(null)

  const [adminNewUsername, setAdminNewUsername] = useState('')
  const [adminNewEmail, setAdminNewEmail] = useState('')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminNewRole, setAdminNewRole] = useState('agent')
  const [adminCreateError, setAdminCreateError] = useState('')
  const [adminCreateOk, setAdminCreateOk] = useState('')

  const [analyticsSummary, setAnalyticsSummary] = useState(null)
  const [analyticsResolution, setAnalyticsResolution] = useState(null)
  const [analyticsVolume, setAnalyticsVolume] = useState(null)
  const [analyticsError, setAnalyticsError] = useState('')

  const role = useMemo(() => user?.profile?.role || null, [user])

  useEffect(() => {
    const baseUrl = getApiBaseUrl()
    fetch(`${baseUrl}/api/health/`)
      .then((r) => r.json())
      .then((d) => setHealth(d.status))
      .catch(() => setHealth('backend unreachable'))
  }, [])

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }

    let cancelled = false
    const run = async () => {
      try {
        const u = await apiFetch('/api/me/', {
          token,
          onAuthRefresh: (nextAccess) => {
            if (cancelled) return
            localStorage.setItem(TOKEN_KEY, nextAccess)
            setToken(nextAccess)
          },
        })
        if (!cancelled) setUser(u)
      } catch (err) {
        if (cancelled) return
        if (err && err.status === 401) {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(REFRESH_KEY)
          setToken('')
          setRefreshToken('')
        }
        setUser(null)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [token])

  async function login(e) {
    e.preventDefault()
    setLoginError('')
    try {
      const data = await apiFetch('/api/auth/token/', {
        method: 'POST',
        body: { username: loginUsername, password: loginPassword },
      })
      localStorage.setItem(TOKEN_KEY, data.access)
      localStorage.setItem(REFRESH_KEY, data.refresh)
      setToken(data.access)
      setRefreshToken(data.refresh)
      setLoginUsername('')
      setLoginPassword('')
    } catch (err) {
      setLoginError(err.message)
    }
  }

  async function register(e) {
    e.preventDefault()
    setRegisterError('')
    try {
      const data = await apiFetch('/api/auth/register/', {
        method: 'POST',
        body: {
          username: registerUsername,
          email: registerEmail,
          password: registerPassword,
        },
      })
      localStorage.setItem(TOKEN_KEY, data.access)
      localStorage.setItem(REFRESH_KEY, data.refresh)
      setToken(data.access)
      setRefreshToken(data.refresh)
      setRegisterUsername('')
      setRegisterEmail('')
      setRegisterPassword('')
    } catch (err) {
      setRegisterError(err.message)
    }
  }

  async function adminCreateUser(e) {
    e.preventDefault()
    if (!token) return
    setAdminCreateError('')
    setAdminCreateOk('')
    try {
      await apiFetch('/api/admin/users/', {
        method: 'POST',
        token,
        body: {
          username: adminNewUsername,
          email: adminNewEmail,
          password: adminNewPassword,
          role: adminNewRole,
        },
      })
      setAdminCreateOk('User created')
      setAdminNewUsername('')
      setAdminNewEmail('')
      setAdminNewPassword('')
      setAdminNewRole('agent')
    } catch (err) {
      setAdminCreateError(err.message)
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setToken('')
    setRefreshToken('')
    setUser(null)
    setSelectedTicketId(null)
    setSelectedTicket(null)
    setMessages([])
  }

  async function loadTickets() {
    if (!token) return
    setTicketsError('')
    try {
      const list = await apiFetch('/api/tickets/', { token })
      setTickets(Array.isArray(list) ? list : [])
    } catch (err) {
      setTicketsError(err.message)
    }
  }

  async function searchTickets(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!token) return
    const q = ticketSearch.trim()
    if (!q) {
      await loadTickets()
      return
    }
    setTicketsError('')
    setTicketSearchLoading(true)
    try {
      const res = await apiFetch(`/api/tickets/search/?q=${encodeURIComponent(q)}`, { token })
      setTickets(Array.isArray(res) ? res : [])
    } catch (err) {
      setTicketsError(err.message)
    } finally {
      setTicketSearchLoading(false)
    }
  }

  async function loadTicketDetail(ticketId) {
    if (!token) return
    const t = await apiFetch(`/api/tickets/${ticketId}/`, { token })
    setSelectedTicket(t)
    const msgs = await apiFetch(`/api/tickets/${ticketId}/messages/`, { token })
    setMessages(Array.isArray(msgs) ? msgs : [])
  }

  useEffect(() => {
    if (!token) return
    loadTickets()
  }, [token])

  useEffect(() => {
    if (!token || !selectedTicketId) return
    loadTicketDetail(selectedTicketId)
  }, [token, selectedTicketId])

  useEffect(() => {
    if (!token || !selectedTicketId) return

    const wsBase = getWsBaseUrl()
    const url = `${wsBase}/ws/tickets/${selectedTicketId}/?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const payload = safeJsonParse(event.data)
      if (!payload || !payload.type) return

      if (payload.type === 'ticket.message_created' && payload.message) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === payload.message.id)
          if (exists) return prev
          return [...prev, payload.message]
        })
      }

      if (payload.type === 'ticket.status_changed') {
        setSelectedTicket((prev) => (prev ? { ...prev, status: payload.status } : prev))
        setTickets((prev) =>
          prev.map((t) => (t.id === payload.ticket_id ? { ...t, status: payload.status } : t))
        )
      }

      if (payload.type === 'ticket.assigned') {
        setSelectedTicket((prev) =>
          prev
            ? {
                ...prev,
                assigned_agent: payload.assigned_agent,
                status: payload.status || prev.status,
              }
            : prev
        )
        setTickets((prev) =>
          prev.map((t) =>
            t.id === payload.ticket_id
              ? {
                  ...t,
                  assigned_agent: payload.assigned_agent,
                  status: payload.status || t.status,
                }
              : t
          )
        )
      }
    }

    ws.onerror = () => {}
    ws.onclose = () => {}

    return () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [token, selectedTicketId])

  async function createTicket(e) {
    e.preventDefault()
    if (!token) return
    const created = await apiFetch('/api/tickets/', {
      method: 'POST',
      token,
      body: {
        subject: newTicketSubject,
        description: newTicketDescription,
        priority: newTicketPriority,
      },
    })
    setNewTicketSubject('')
    setNewTicketDescription('')
    setNewTicketPriority('MEDIUM')
    await loadTickets()
    setSelectedTicketId(created.id)
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!token || !selectedTicketId) return

    const created = await apiFetch(`/api/tickets/${selectedTicketId}/messages/`, {
      method: 'POST',
      token,
      body: {
        body: newMessage,
        is_internal: newMessageInternal,
      },
    })
    setNewMessage('')
    setNewMessageInternal(false)
    setMessages((prev) => {
      const exists = prev.some((m) => m.id === created.id)
      if (exists) return prev
      return [...prev, created]
    })
  }

  async function generateAIDraft() {
    if (!token || !selectedTicketId) return
    setAiDraftError('')
    setAiDraftLoading(true)
    try {
      const res = await apiFetch(`/api/tickets/${selectedTicketId}/ai-draft/`, {
        method: 'POST',
        token,
        body: {},
      })
      setAiDraft(res?.draft || '')
    } catch (err) {
      setAiDraftError(err.message)
    } finally {
      setAiDraftLoading(false)
    }
  }

  async function sendAIDraft(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!aiDraft.trim()) return
    if (!token || !selectedTicketId) return

    const created = await apiFetch(`/api/tickets/${selectedTicketId}/messages/`, {
      method: 'POST',
      token,
      body: {
        body: aiDraft,
        is_internal: false,
      },
    })
    setAiDraft('')
    setMessages((prev) => {
      const exists = prev.some((m) => m.id === created.id)
      if (exists) return prev
      return [...prev, created]
    })
  }

  async function toggleAvailability(nextAvailable) {
    if (!token) return
    const res = await apiFetch('/api/me/availability/', {
      method: 'PATCH',
      token,
      body: { is_available: nextAvailable },
    })
    setAvailability(res)
  }

  useEffect(() => {
    if (!token) return
    if (!role) return
    if (role !== 'agent' && role !== 'admin') return
    apiFetch('/api/me/availability/', { method: 'GET', token })
      .then((r) => setAvailability(r))
      .catch(() => {})
  }, [token, role])

  useEffect(() => {
    if (!token) return
    if (role !== 'admin') return

    let cancelled = false
    setAnalyticsError('')
    Promise.all([
      apiFetch('/api/analytics/summary/', { token }),
      apiFetch('/api/analytics/resolution/', { token }),
      apiFetch('/api/analytics/volume/?days=30', { token }),
    ])
      .then(([s, r, v]) => {
        if (cancelled) return
        setAnalyticsSummary(s)
        setAnalyticsResolution(r)
        setAnalyticsVolume(v)
      })
      .catch((err) => {
        if (cancelled) return
        setAnalyticsError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, role])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `radial-gradient(1200px 600px at 20% 0%, rgba(96,165,250,0.20), transparent 60%), radial-gradient(900px 500px at 90% 20%, rgba(167,139,250,0.16), transparent 60%), ${UI.colors.bg}`,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: UI.colors.text,
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.2 }}>
              Smart Customer Support & Ticket Automation
            </div>
            <div style={{ color: UI.colors.muted, marginTop: 6, fontSize: 12 }}>Backend health: {health}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {user ? (
              <>
                <div style={{ color: UI.colors.text, fontWeight: 650 }}>
                  {user.username} {user.profile?.role ? `(${user.profile.role})` : ''}
                </div>
                <Button variant="ghost" onClick={logout} style={{ padding: '8px 12px' }}>
                  Logout
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {!token || !user ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Welcome</div>
            <div style={{ color: UI.colors.muted, marginBottom: 14, fontSize: 13 }}>
              Use dev accounts: admin/admin, agent/agent, customer/customer
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
                alignItems: 'start',
              }}
            >
              <form onSubmit={login} style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 800 }}>Sign in</div>
                <Field label="Username">
                  <Input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="username" />
                </Field>
                <Field label="Password">
                  <Input
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="password"
                    type="password"
                  />
                </Field>
                <Button type="submit">Login</Button>
                {loginError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{loginError}</div> : null}
              </form>

              <form onSubmit={register} style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 800 }}>Create account</div>
                <Field label="Username">
                  <Input
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                    placeholder="username"
                  />
                </Field>
                <Field label="Email" hint="Optional">
                  <Input
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="email"
                  />
                </Field>
                <Field label="Password">
                  <Input
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="password"
                    type="password"
                  />
                </Field>
                <Button type="submit">Create</Button>
                {registerError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{registerError}</div> : null}
              </form>
            </div>
          </Card>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 380px) 1fr',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Tickets</div>
                  <Button variant="ghost" onClick={loadTickets} style={{ padding: '6px 10px' }}>
                    Refresh
                  </Button>
                </div>
                {ticketsError ? <div style={{ color: UI.colors.danger, marginTop: 8 }}>{ticketsError}</div> : null}
                <form onSubmit={searchTickets} style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                  <Input
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    placeholder="Search tickets…"
                  />
                  <Button type="submit" style={{ whiteSpace: 'nowrap' }} disabled={ticketSearchLoading}>
                    {ticketSearchLoading ? 'Searching…' : 'Search'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      setTicketSearch('')
                      await loadTickets()
                    }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Clear
                  </Button>
                </form>
                <div style={{ marginTop: 12, display: 'grid', gap: 8, maxHeight: 440, overflow: 'auto' }}>
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      style={{
                        textAlign: 'left',
                        padding: 10,
                        borderRadius: 10,
                        border:
                          selectedTicketId === t.id
                            ? '1px solid rgba(96,165,250,0.55)'
                            : `1px solid ${UI.colors.border}`,
                        background: selectedTicketId === t.id ? 'rgba(96,165,250,0.10)' : UI.colors.surface2,
                        color: UI.colors.text,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 750, color: UI.colors.text }}>#{t.id} {t.subject}</div>
                        <StatusPill status={t.status} />
                      </div>
                      <div style={{ color: UI.colors.muted, fontSize: 12, marginTop: 6 }}>
                        priority: {t.priority} • assigned_agent: {t.assigned_agent ?? '—'}
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              {role === 'customer' ? (
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Create Ticket</div>
                  <form onSubmit={createTicket} style={{ display: 'grid', gap: 8 }}>
                    <Field label="Subject">
                      <Input
                        value={newTicketSubject}
                        onChange={(e) => setNewTicketSubject(e.target.value)}
                        placeholder="Subject"
                        required
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        value={newTicketDescription}
                        onChange={(e) => setNewTicketDescription(e.target.value)}
                        placeholder="Description"
                        rows={3}
                      />
                    </Field>
                    <Field label="Priority">
                      <Select value={newTicketPriority} onChange={(e) => setNewTicketPriority(e.target.value)}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                      </Select>
                    </Field>
                    <Button type="submit">Create</Button>
                  </form>
                </Card>
              ) : null}

              {role === 'agent' || role === 'admin' ? (
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Agent Presence</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ color: UI.colors.text, fontWeight: 650 }}>
                      Available: {availability?.role ? String(availability.is_available) : String(availability?.is_available ?? '—')}
                    </div>
                    <Button variant="primary" onClick={() => toggleAvailability(true)} style={{ padding: '8px 10px' }}>
                      Go online
                    </Button>
                    <Button variant="ghost" onClick={() => toggleAvailability(false)} style={{ padding: '8px 10px' }}>
                      Go offline
                    </Button>
                  </div>
                </Card>
              ) : null}

              {role === 'admin' ? (
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Admin: Create User</div>
                  <form onSubmit={adminCreateUser} style={{ display: 'grid', gap: 8 }}>
                    <Field label="Username">
                      <Input
                        value={adminNewUsername}
                        onChange={(e) => setAdminNewUsername(e.target.value)}
                        placeholder="username"
                        required
                      />
                    </Field>
                    <Field label="Email" hint="Optional">
                      <Input
                        value={adminNewEmail}
                        onChange={(e) => setAdminNewEmail(e.target.value)}
                        placeholder="email"
                      />
                    </Field>
                    <Field label="Password">
                      <Input
                        value={adminNewPassword}
                        onChange={(e) => setAdminNewPassword(e.target.value)}
                        placeholder="password"
                        type="password"
                        required
                      />
                    </Field>
                    <Field label="Role">
                      <Select value={adminNewRole} onChange={(e) => setAdminNewRole(e.target.value)}>
                      <option value="agent">agent</option>
                      <option value="admin">admin</option>
                      <option value="customer">customer</option>
                      </Select>
                    </Field>
                    <Button type="submit">Create user</Button>
                    {adminCreateOk ? <div style={{ color: UI.colors.success }}>{adminCreateOk}</div> : null}
                    {adminCreateError ? <div style={{ color: UI.colors.danger }}>{adminCreateError}</div> : null}
                  </form>
                </Card>
              ) : null}

              {role === 'admin' ? (
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Admin: Analytics</div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAnalyticsSummary(null)
                        setAnalyticsResolution(null)
                        setAnalyticsVolume(null)
                        setAnalyticsError('')
                        apiFetch('/api/analytics/summary/', { token })
                          .then((s) => setAnalyticsSummary(s))
                          .catch((e) => setAnalyticsError(e.message))
                        apiFetch('/api/analytics/resolution/', { token })
                          .then((r) => setAnalyticsResolution(r))
                          .catch((e) => setAnalyticsError(e.message))
                        apiFetch('/api/analytics/volume/?days=30', { token })
                          .then((v) => setAnalyticsVolume(v))
                          .catch((e) => setAnalyticsError(e.message))
                      }}
                      style={{ padding: '6px 10px' }}
                    >
                      Refresh
                    </Button>
                  </div>

                  {analyticsError ? <div style={{ color: UI.colors.danger, marginTop: 8 }}>{analyticsError}</div> : null}

                  <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                        <div style={{ color: UI.colors.muted, fontSize: 12 }}>Total tickets</div>
                        <div style={{ fontSize: 20, fontWeight: 800 }}>{analyticsSummary?.total ?? '—'}</div>
                      </div>
                      <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                        <div style={{ color: UI.colors.muted, fontSize: 12 }}>Open / Unresolved</div>
                        <div style={{ fontSize: 20, fontWeight: 800 }}>{analyticsSummary?.open_like ?? '—'}</div>
                      </div>
                    </div>

                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                      <div style={{ color: UI.colors.muted, fontSize: 12 }}>Avg resolution (seconds)</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{analyticsResolution?.avg_resolution_seconds ?? '—'}</div>
                      <div style={{ color: UI.colors.muted, fontSize: 12, marginTop: 4 }}>
                        resolved_count: {analyticsResolution?.resolved_count ?? '—'}
                      </div>
                    </div>

                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                      <div style={{ color: UI.colors.muted, fontSize: 12 }}>Volume (last 30 days)</div>
                      <div style={{ color: UI.colors.muted, fontSize: 12, marginTop: 6 }}>
                        {analyticsVolume?.series ? `days with tickets: ${analyticsVolume.series.filter((x) => x.count > 0).length}` : '—'}
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>

            <Card>
              {!selectedTicket ? (
                <div style={{ color: UI.colors.muted }}>Select a ticket to view details.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      #{selectedTicket.id} {selectedTicket.subject}
                    </div>
                    <StatusPill status={selectedTicket.status} />
                  </div>
                  <div style={{ color: UI.colors.muted }}>{selectedTicket.description}</div>
                  <div style={{ color: UI.colors.muted, fontSize: 12 }}>
                    assigned_agent: {selectedTicket.assigned_agent ?? '—'}
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid rgba(0,0,0,0.08)',
                      paddingTop: 12,
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    {(role === 'agent' || role === 'admin') && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>AI Draft</div>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={generateAIDraft}
                            style={{ padding: '8px 10px' }}
                            disabled={aiDraftLoading}
                          >
                            {aiDraftLoading ? 'Generating…' : 'Generate'}
                          </Button>
                        </div>
                        <Textarea
                          value={aiDraft}
                          onChange={(e) => setAiDraft(e.target.value)}
                          placeholder="AI suggested reply will appear here…"
                          rows={3}
                        />
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <Button type="button" variant="ghost" onClick={() => setAiDraft('')}>
                            Clear
                          </Button>
                          <Button type="button" onClick={sendAIDraft}>
                            Send draft
                          </Button>
                        </div>
                        {aiDraftError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{aiDraftError}</div> : null}
                      </div>
                    )}

                    <div style={{ fontSize: 14, fontWeight: 700 }}>Messages</div>
                    <div style={{ maxHeight: 420, overflow: 'auto', display: 'grid', gap: 10 }}>
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            background: m.is_internal ? 'rgba(251,191,36,0.10)' : UI.colors.surface2,
                            border: `1px solid ${UI.colors.border}`,
                          }}
                        >
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>
                            author: {m.author ?? '—'} • {m.is_internal ? 'internal' : 'public'}
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={sendMessage} style={{ display: 'grid', gap: 8 }}>
                      <Textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Write a message..."
                        rows={3}
                        required
                      />
                      {(role === 'agent' || role === 'admin') && (
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: UI.colors.text }}>
                          <input
                            type="checkbox"
                            checked={newMessageInternal}
                            onChange={(e) => setNewMessageInternal(e.target.checked)}
                          />
                          Internal note
                        </label>
                      )}
                      <Button type="submit">Send</Button>
                    </form>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
