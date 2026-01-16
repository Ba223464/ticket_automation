import { useEffect, useMemo, useRef, useState } from 'react'

const TOKEN_KEY = 'ta_access'
const REFRESH_KEY = 'ta_refresh'
const THEME_KEY = 'ta_theme'

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL
}

function sortTickets(list, mode) {
  const arr = Array.isArray(list) ? [...list] : []
  if (mode === 'priority') {
    const score = (p) => (p === 'URGENT' ? 4 : p === 'HIGH' ? 3 : p === 'MEDIUM' ? 2 : p === 'LOW' ? 1 : 0)
    arr.sort((a, b) => score(b.priority) - score(a.priority) || (a.id || 0) - (b.id || 0))
    return arr
  }
  // oldest
  arr.sort((a, b) => (a.id || 0) - (b.id || 0))
  return arr
}

function getSpeechRecognition() {
  try {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  } catch {
    return null
  }
}

function MicIcon({ active }) {
  const color = active ? '#ffffff' : UI.colors.text
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm-7-3a1 1 0 1 0-2 0 9 9 0 0 0 8 8.95V22a1 1 0 1 0 2 0v-2.05A9 9 0 0 0 21 11a1 1 0 1 0-2 0 7 7 0 0 1-14 0Z"
        fill={color}
      />
    </svg>
  )
}

function getWsBaseUrl() {
  return import.meta.env.VITE_WS_BASE_URL
}

function toAbsoluteUrl(maybeRelativeUrl) {
  const u = (maybeRelativeUrl || '').trim()
  if (!u) return ''
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  const base = getApiBaseUrl()
  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
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

const BASE_THEMES = {
  light: {
    bg: '#F6FFF5',
    surface: '#ffffff',
    surface2: '#FBFFF9',
    border: 'rgba(41,51,37,0.18)',
    text: '#293325',
    muted: 'rgba(41,51,37,0.68)',
    danger: '#dc2626',
    warning: '#d97706',
    shadow: 'rgba(41,51,37,0.10)',
    shadowStrong: 'rgba(41,51,37,0.18)',
  },
  dark: {
    bg: '#141A14',
    surface: '#1B231B',
    surface2: '#202B20',
    border: 'rgba(246,255,245,0.14)',
    text: '#F6FFF5',
    muted: 'rgba(246,255,245,0.72)',
    danger: '#f87171',
    warning: '#f59e0b',
    shadow: 'rgba(0,0,0,0.25)',
    shadowStrong: 'rgba(0,0,0,0.45)',
  },
}

const ROLE_ACCENTS = {
  customer: {
    primary: '#4CBB17',
    primaryBg: 'rgba(76,187,23,0.16)',
    focusBorder: 'rgba(76,187,23,0.55)',
    focusRing: 'rgba(76,187,23,0.16)',
    success: '#48872B',
    sidebarBgLight: '#293325',
    sidebarBgDark: '#0F140F',
    sidebarSurface: 'rgba(76,187,23,0.10)',
    sidebarBorder: 'rgba(76,187,23,0.18)',
    sidebarText: '#F6FFF5',
    sidebarMutedLight: 'rgba(246,255,245,0.72)',
    sidebarMutedDark: 'rgba(246,255,245,0.72)',
  },
  agent: {
    primary: '#2563eb',
    primaryBg: 'rgba(37,99,235,0.16)',
    focusBorder: 'rgba(37,99,235,0.55)',
    focusRing: 'rgba(37,99,235,0.16)',
    success: '#2563eb',
    sidebarBgLight: '#0b1220',
    sidebarBgDark: '#07101f',
    sidebarSurface: 'rgba(37,99,235,0.10)',
    sidebarBorder: 'rgba(37,99,235,0.18)',
    sidebarText: '#eef2ff',
    sidebarMutedLight: 'rgba(238,242,255,0.72)',
    sidebarMutedDark: 'rgba(238,242,255,0.72)',
  },
  admin: {
    primary: '#9a3412',
    primaryBg: 'rgba(154,52,18,0.16)',
    focusBorder: 'rgba(154,52,18,0.55)',
    focusRing: 'rgba(154,52,18,0.16)',
    success: '#9a3412',
    sidebarBgLight: '#3b2217',
    sidebarBgDark: '#22140e',
    sidebarSurface: 'rgba(154,52,18,0.12)',
    sidebarBorder: 'rgba(154,52,18,0.20)',
    sidebarText: '#fff7ed',
    sidebarMutedLight: 'rgba(255,247,237,0.72)',
    sidebarMutedDark: 'rgba(255,247,237,0.72)',
  },
}

function resolveColors(mode, role) {
  const base = BASE_THEMES[mode] || BASE_THEMES.light
  const accent = ROLE_ACCENTS[role] || ROLE_ACCENTS.customer
  return {
    ...base,
    primary: accent.primary,
    primaryBg: accent.primaryBg,
    focusBorder: accent.focusBorder,
    focusRing: accent.focusRing,
    success: accent.success,
    sidebarBg: mode === 'dark' ? accent.sidebarBgDark : accent.sidebarBgLight,
    sidebarSurface: accent.sidebarSurface,
    sidebarBorder: accent.sidebarBorder,
    sidebarText: accent.sidebarText,
    sidebarMuted: mode === 'dark' ? accent.sidebarMutedDark : accent.sidebarMutedLight,
  }
}

const UI = {
  colors: resolveColors('light', 'customer'),
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
    transition: 'transform 90ms ease, background 150ms ease, border 150ms ease, box-shadow 150ms ease',
    boxShadow: `0 1px 2px ${UI.colors.shadow}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }

  const variants = {
    primary: {
      background: UI.colors.primary,
      border: `1px solid ${UI.colors.primary}`,
      color: '#ffffff',
    },
    ghost: {
      background: 'transparent',
    },
    danger: {
      background: UI.colors.danger,
      border: `1px solid ${UI.colors.danger}`,
      color: '#ffffff',
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
      onMouseEnter={(e) => {
        try {
          e.currentTarget.style.boxShadow = `0 6px 18px ${UI.colors.shadow}`
        } catch {
          // ignore
        }
        props.onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        try {
          e.currentTarget.style.boxShadow = `0 1px 2px ${UI.colors.shadow}`
          e.currentTarget.style.transform = 'none'
        } catch {
          // ignore
        }
        props.onMouseLeave?.(e)
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

function AttachmentViewer({ open, attachment, onClose }) {
  if (!open || !attachment) return null
  const url = toAbsoluteUrl(attachment.url)
  const name = attachment.filename || 'attachment'
  const ct = (attachment.content_type || '').toLowerCase()
  const isImage = ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
  const isPdf = ct === 'application/pdf' || /\.pdf$/i.test(name)
  const isDocx =
    ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(name) || /\.doc$/i.test(name)
  const isText =
    ct.startsWith('text/') || /\.(md|txt|log|json|csv|py|js|ts|tsx|jsx|html|css)$/i.test(name)

  const [blobUrl, setBlobUrl] = useState('')
  const [textPreview, setTextPreview] = useState('')
  const [textPreviewError, setTextPreviewError] = useState('')

  useEffect(() => {
    let cancelled = false
    let createdUrl = ''

    const run = async () => {
      try {
        if (!open || !url) return
        const access = localStorage.getItem(TOKEN_KEY) || ''
        const res = await fetch(url, {
          headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        })
        if (!res.ok) {
          if (!cancelled) setTextPreviewError(`Unable to preview file (HTTP ${res.status})`)
          return
        }
        const blob = await res.blob()
        createdUrl = URL.createObjectURL(blob)
        if (!cancelled) setBlobUrl(createdUrl)

        if (isText) {
          try {
            const text = await blob.text()
            if (!cancelled) setTextPreview(text)
          } catch (e) {
            if (!cancelled) setTextPreviewError(e?.message || 'Unable to preview text')
          }
        }
      } catch {
        if (!cancelled) setTextPreviewError('Unable to preview file')
      }
    }

    setBlobUrl('')
    setTextPreview('')
    setTextPreviewError('')
    run()

    return () => {
      cancelled = true
      try {
        if (createdUrl) URL.revokeObjectURL(createdUrl)
      } catch {
        // ignore
      }
    }
  }, [open, url, isText])

  const previewUrl = blobUrl || url

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1000px, 96vw)',
          height: 'min(700px, 92vh)',
          background: UI.colors.surface,
          borderRadius: 14,
          border: `1px solid ${UI.colors.border}`,
          boxShadow: `0 20px 50px ${UI.colors.shadowStrong}`,
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          <ActionRow style={{ justifyContent: 'flex-end' }}>
            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: UI.colors.primary, textDecoration: 'none', fontWeight: 700 }}>
              Open
            </a>
            <Button type="button" variant="ghost" onClick={onClose} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
              Close
            </Button>
          </ActionRow>
        </div>
        <div style={{ background: UI.colors.surface2, borderTop: `1px solid ${UI.colors.border}`, overflow: 'auto' }}>
          {isDocx ? (
            <div style={{ padding: 12, color: UI.colors.muted, fontSize: 13 }}>
              Preview is not available for Word documents. Use the Open link above.
            </div>
          ) : isText ? (
            <div style={{ width: '100%', minHeight: '100%', padding: 12 }}>
              {textPreviewError ? (
                <div style={{ color: UI.colors.danger, fontSize: 13 }}>{textPreviewError}</div>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${UI.colors.border}`,
                    background: UI.colors.surface,
                    color: UI.colors.text,
                    fontSize: 12,
                    lineHeight: '18px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {textPreview || 'Loading preview…'}
                </pre>
              )}
            </div>
          ) : isImage ? (
            <div style={{ width: '100%', minHeight: '100%', padding: 12 }}>
              <img
                src={previewUrl}
                alt={name}
                style={{ maxWidth: '100%', height: 'auto', display: 'block', borderRadius: 12, border: `1px solid ${UI.colors.border}` }}
              />
            </div>
          ) : isPdf ? (
            <div style={{ width: '100%', height: '100%' }}>
              <iframe title={name} src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
              <object data={previewUrl} type="application/pdf" width="0" height="0">
                <div style={{ padding: 12, color: UI.colors.muted, fontSize: 13 }}>
                  Preview not available. Use the Open link above.
                </div>
              </object>
            </div>
          ) : (
            <iframe title={name} src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
          )}
        </div>
      </div>
    </div>
  )
}

function ActionRow({ children, style }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {children}
    </div>
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
      className={(props.className ? `${props.className} ` : '') + 'ta-field'}
      style={{
        width: '100%',
        height: 38,
        padding: '9px 12px',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: UI.colors.surface,
        color: UI.colors.text,
        outline: 'none',
        fontSize: 14,
        lineHeight: '20px',
        boxShadow: `0 1px 2px ${UI.colors.shadow}`,
        transition: 'border 150ms ease, box-shadow 150ms ease, background 150ms ease',
        ...(props.disabled
          ? {
              background: UI.colors.surface2,
              color: UI.colors.muted,
              cursor: 'not-allowed',
              opacity: 0.9,
            }
          : null),
        ...(props.style || {}),
      }}
      onFocus={(e) => {
        try {
          e.currentTarget.style.borderColor = UI.colors.focusBorder || UI.colors.primary
          e.currentTarget.style.boxShadow = `0 0 0 4px ${UI.colors.focusRing || UI.colors.primaryBg}`
        } catch {
          // ignore
        }
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        try {
          e.currentTarget.style.borderColor = UI.colors.border
          e.currentTarget.style.boxShadow = `0 1px 2px ${UI.colors.shadow}`
        } catch {
          // ignore
        }
        props.onBlur?.(e)
      }}
    />
  )
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={(props.className ? `${props.className} ` : '') + 'ta-field'}
      style={{
        width: '100%',
        padding: '10px 12px',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: UI.colors.surface,
        color: UI.colors.text,
        outline: 'none',
        resize: 'vertical',
        fontSize: 14,
        lineHeight: '20px',
        boxShadow: `0 1px 2px ${UI.colors.shadow}`,
        transition: 'border 150ms ease, box-shadow 150ms ease, background 150ms ease',
        ...(props.disabled
          ? {
              background: UI.colors.surface2,
              color: UI.colors.muted,
              cursor: 'not-allowed',
              opacity: 0.9,
            }
          : null),
        ...(props.style || {}),
      }}
      onFocus={(e) => {
        try {
          e.currentTarget.style.borderColor = UI.colors.focusBorder || UI.colors.primary
          e.currentTarget.style.boxShadow = `0 0 0 4px ${UI.colors.focusRing || UI.colors.primaryBg}`
        } catch {
          // ignore
        }
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        try {
          e.currentTarget.style.borderColor = UI.colors.border
          e.currentTarget.style.boxShadow = `0 1px 2px ${UI.colors.shadow}`
        } catch {
          // ignore
        }
        props.onBlur?.(e)
      }}
    />
  )
}

function Select(props) {
  return (
    <select
      {...props}
      className={(props.className ? `${props.className} ` : '') + 'ta-field'}
      style={{
        width: '100%',
        height: 38,
        padding: '9px 12px',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: UI.colors.surface,
        color: UI.colors.text,
        outline: 'none',
        boxShadow: `0 1px 2px ${UI.colors.shadow}`,
        transition: 'border 150ms ease, box-shadow 150ms ease, background 150ms ease',
        ...(props.disabled
          ? {
              background: UI.colors.surface2,
              color: UI.colors.muted,
              cursor: 'not-allowed',
              opacity: 0.9,
            }
          : null),
        ...(props.style || {}),
      }}
    />
  )
}

function StatusPill({ status }) {
  const bg =
    status === 'OPEN'
      ? UI.colors.primaryBg
      : status === 'ASSIGNED'
        ? 'rgba(2,132,199,0.10)'
        : status === 'IN_PROGRESS'
          ? 'rgba(217,119,6,0.12)'
          : status === 'WAITING_ON_CUSTOMER'
            ? 'rgba(124,58,237,0.10)'
            : status === 'RESOLVED'
              ? UI.colors.primaryBg
              : 'rgba(15,23,42,0.06)'

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

function Card({ children, style }) {
  return (
    <div
      style={{
        background: UI.colors.surface,
        border: `1px solid ${UI.colors.border}`,
        borderRadius: UI.radius,
        padding: 16,
        boxShadow: `0 10px 24px ${UI.colors.shadow}`,
        ...(style || {}),
      }}
    >
      {children}
    </div>
  )
}

function SidebarItem({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        width: '100%',
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${UI.colors.sidebarBorder}`,
        background: active ? UI.colors.primaryBg : UI.colors.sidebarSurface,
        color: UI.colors.sidebarText,
        cursor: 'pointer',
        fontWeight: active ? 800 : 650,
        transition: 'background 120ms ease, box-shadow 120ms ease, transform 80ms ease',
      }}
      onMouseEnter={(e) => {
        try {
          e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.35)'
        } catch {
          // ignore
        }
      }}
      onMouseLeave={(e) => {
        try {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'none'
        } catch {
          // ignore
        }
      }}
    >
      {children}
    </button>
  )
}

export default function App() {
  const [health, setHealth] = useState('loading...')
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem(REFRESH_KEY) || '')
  const [theme, setTheme] = useState(() => {
    const v = (localStorage.getItem(THEME_KEY) || '').toLowerCase()
    return v === 'dark' ? 'dark' : 'light'
  })
  const [user, setUser] = useState(null)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [registerUsername, setRegisterUsername] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerOtpSent, setRegisterOtpSent] = useState(false)
  const [registerOtpCode, setRegisterOtpCode] = useState('')
  const [registerVerificationToken, setRegisterVerificationToken] = useState('')
  const [registerOtpLoading, setRegisterOtpLoading] = useState(false)

  const [tickets, setTickets] = useState([])
  const [ticketsError, setTicketsError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignedAgent, setFilterAssignedAgent] = useState('')
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('')
  const [filterCreatedTo, setFilterCreatedTo] = useState('')
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
  const [newMessageFiles, setNewMessageFiles] = useState([])
  const [sendMessageError, setSendMessageError] = useState('')

  const [aiDraft, setAiDraft] = useState('')
  const [aiDraftLoading, setAiDraftLoading] = useState(false)
  const [aiDraftError, setAiDraftError] = useState('')

  const [availability, setAvailability] = useState(null)
  const [adminAgentsPresence, setAdminAgentsPresence] = useState(null)
  const [adminAgentsPresenceError, setAdminAgentsPresenceError] = useState('')
  const wsRef = useRef(null)

  const didSetInitialPanelRef = useRef(false)

  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerAttachment, setViewerAttachment] = useState(null)

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
  const [analyticsDays, setAnalyticsDays] = useState(30)

  const [agentQueueSort, setAgentQueueSort] = useState('oldest')

  const [sttTarget, setSttTarget] = useState(null)
  const [sttListening, setSttListening] = useState(false)
  const [sttError, setSttError] = useState('')
  const sttRef = useRef(null)
  const sttShouldRunRef = useRef(false)
  const newMessageFilesInputRef = useRef(null)

  const [activePanel, setActivePanel] = useState('tickets')
  const [authTab, setAuthTab] = useState('login')

  const role = useMemo(() => user?.profile?.role || null, [user])

  UI.colors = resolveColors(theme === 'dark' ? 'dark' : 'light', role || 'customer')

  const sttSupported = useMemo(() => !!getSpeechRecognition(), [])

  useEffect(() => {
    return () => {
      try {
        sttShouldRunRef.current = false
        sttRef.current?.stop?.()
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  function stopStt({ clearError = true } = {}) {
    try {
      sttShouldRunRef.current = false
      sttRef.current?.stop?.()
    } catch {
      // ignore
    }
    sttRef.current = null
    setSttListening(false)
    setSttTarget(null)
    if (clearError) setSttError('')
  }

  function startStt(target) {
    if (role !== 'customer') return
    const SR = getSpeechRecognition()
    if (!SR) return

    try {
      if (window.location?.protocol !== 'https:' && window.location?.hostname !== 'localhost') {
        setSttError('Voice input requires HTTPS (or localhost).')
        return
      }
    } catch {
      // ignore
    }

    try {
      if (sttRef.current) stopStt()
      setSttError('')

      const rec = new SR()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = 'en-US'

      rec.onresult = (event) => {
        let finalText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i]
          const txt = res?.[0]?.transcript || ''
          if (res.isFinal) finalText += txt
        }

        const append = (text) => {
          const t = (text || '').trim()
          if (!t) return
          if (target === 'new_ticket_description') {
            setNewTicketDescription((prev) => (prev ? `${prev} ${t}` : t))
          } else if (target === 'reply') {
            setNewMessage((prev) => (prev ? `${prev} ${t}` : t))
          }
        }

        if (finalText.trim()) append(finalText)
      }

      rec.onerror = (e) => {
        const code = e?.error || ''
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setSttError('Microphone permission denied.')
        } else if (code === 'no-speech') {
          setSttError('No speech detected.')
        } else {
          const msg = e?.message ? `: ${e.message}` : ''
          setSttError(`Voice input failed${code ? ` (${code})` : ''}${msg}`)
        }
        stopStt({ clearError: false })
      }

      rec.onend = () => {
        if (sttShouldRunRef.current) {
          try {
            rec.start()
            return
          } catch {
            // ignore
          }
        }
        setSttListening(false)
        sttRef.current = null
        setSttTarget(null)
      }

      sttRef.current = rec
      setSttTarget(target)
      setSttListening(true)
      sttShouldRunRef.current = true
      rec.start()
    } catch {
      stopStt()
    }
  }

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

  async function loadMe() {
    if (!token) return
    const u = await apiFetch('/api/me/', {
      token,
      onAuthRefresh: (nextAccess) => {
        localStorage.setItem(TOKEN_KEY, nextAccess)
        setToken(nextAccess)
      },
    })
    setUser(u)

    try {
      const nextRole = u?.profile?.role || null
      if (!didSetInitialPanelRef.current && nextRole === 'admin') {
        didSetInitialPanelRef.current = true
        setActivePanel('tickets')
      }
    } catch {
      // ignore
    }
  }

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
      const email = (registerEmail || '').trim()
      if (email) {
        if (!registerOtpSent) {
          setRegisterOtpLoading(true)
          await apiFetch('/api/auth/request-otp/', {
            method: 'POST',
            body: { email },
          })
          setRegisterOtpSent(true)
          setRegisterOtpLoading(false)
          setRegisterError('OTP sent to your email. Enter it below to verify.')
          return
        }

        if (!registerVerificationToken) {
          const code = (registerOtpCode || '').trim()
          if (!code) {
            setRegisterError('Enter the OTP sent to your email')
            return
          }
          setRegisterOtpLoading(true)
          const v = await apiFetch('/api/auth/verify-otp/', {
            method: 'POST',
            body: { email, code },
          })
          setRegisterOtpLoading(false)
          setRegisterVerificationToken(v.verification_token || '')
          setRegisterError('Email verified. Click Create again to finish registration.')
          return
        }
      }

      const data = await apiFetch('/api/auth/register/', {
        method: 'POST',
        body: {
          username: registerUsername,
          email: registerEmail,
          password: registerPassword,
          verification_token: registerVerificationToken || undefined,
        },
      })
      localStorage.setItem(TOKEN_KEY, data.access)
      localStorage.setItem(REFRESH_KEY, data.refresh)
      setToken(data.access)
      setRefreshToken(data.refresh)
      setRegisterUsername('')
      setRegisterEmail('')
      setRegisterPassword('')
      setRegisterOtpSent(false)
      setRegisterOtpCode('')
      setRegisterVerificationToken('')
    } catch (err) {
      setRegisterOtpLoading(false)
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
      const qs = new URLSearchParams()
      if (filterStatus) qs.set('status', filterStatus)
      if (filterPriority) qs.set('priority', filterPriority)
      if (filterAssignedAgent) qs.set('assigned_agent', filterAssignedAgent)
      if (filterCreatedFrom) qs.set('created_from', filterCreatedFrom)
      if (filterCreatedTo) qs.set('created_to', filterCreatedTo)

      const data = await apiFetch(`/api/tickets/${qs.toString() ? `?${qs.toString()}` : ''}`, { token })
      setTickets(Array.isArray(data) ? data : [])
    } catch (err) {
      setTicketsError(err.message)
    }
  }

  useEffect(() => {
    if (!token) return
    loadTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterStatus, filterPriority, filterAssignedAgent, filterCreatedFrom, filterCreatedTo])

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
      const qs = new URLSearchParams()
      qs.set('q', q)
      if (filterStatus) qs.set('status', filterStatus)
      if (filterPriority) qs.set('priority', filterPriority)
      if (filterAssignedAgent) qs.set('assigned_agent', filterAssignedAgent)
      const data = await apiFetch(`/api/tickets/search/?${qs.toString()}`, { token })
      setTickets(Array.isArray(data) ? data : [])
    } catch (err) {
      setTicketsError(err.message)
    } finally {
      setTicketSearchLoading(false)
    }
  }

  async function loadTicketDetails(id) {
    if (!token || !id) return
    try {
      const detail = await apiFetch(`/api/tickets/${id}/`, { token })
      setSelectedTicket(detail)
    } catch {
      setSelectedTicket(null)
    }

    try {
      const msgs = await apiFetch(`/api/tickets/${id}/messages/`, { token })
      setMessages(Array.isArray(msgs) ? msgs : [])
    } catch {
      setMessages([])
    }
  }

  useEffect(() => {
    if (!token || !selectedTicketId) return
    loadTicketDetails(selectedTicketId)
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

    setSendMessageError('')

    const hasFiles = Array.isArray(newMessageFiles) && newMessageFiles.length > 0
    try {
      let created
      if (!hasFiles) {
        created = await apiFetch(`/api/tickets/${selectedTicketId}/messages/`, {
          method: 'POST',
          token,
          body: {
            body: newMessage,
            is_internal: newMessageInternal,
          },
        })
      } else {
        const baseUrl = getApiBaseUrl()
        const latestAccess = localStorage.getItem(TOKEN_KEY) || ''
        const accessToken = latestAccess || token
        const fd = new FormData()
        fd.append('body', newMessage)
        fd.append('is_internal', newMessageInternal ? 'true' : 'false')
        for (const f of newMessageFiles) fd.append('files', f)

        const doUpload = async (access) => {
          const res = await fetch(`${baseUrl}/api/tickets/${selectedTicketId}/messages/`, {
            method: 'POST',
            headers: access ? { Authorization: `Bearer ${access}` } : undefined,
            body: fd,
          })
          const text = await res.text()
          const data = text ? safeJsonParse(text) : null
          return { res, text, data }
        }

        let first = await doUpload(accessToken)
        if (first.res.status === 401) {
          const refresh = localStorage.getItem(REFRESH_KEY) || ''
          if (refresh) {
            const refreshRes = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh }),
            })
            const refreshText = await refreshRes.text()
            const refreshData = refreshText ? safeJsonParse(refreshText) : null
            if (refreshRes.ok && refreshData?.access) {
              localStorage.setItem(TOKEN_KEY, refreshData.access)
              setToken(refreshData.access)
              first = await doUpload(refreshData.access)
            }
          }
        }

        if (!first.res.ok) {
          const detail = (first.data && (first.data.detail || first.data.message)) || first.text || `HTTP ${first.res.status}`
          const err = new Error(detail)
          err.status = first.res.status
          err.data = first.data
          throw err
        }

        created = first.data
      }

      setNewMessage('')
      setNewMessageInternal(false)
      setNewMessageFiles([])
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === created.id)
        if (exists) return prev
        return [...prev, created]
      })
    } catch (err) {
      setSendMessageError(err?.message || 'Unable to send message')
    }
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
    if (activePanel !== 'presence') return

    let cancelled = false
    setAdminAgentsPresenceError('')
    apiFetch('/api/admin/agents/presence/', { token })
      .then((r) => {
        if (cancelled) return
        setAdminAgentsPresence(r)
      })
      .catch((e) => {
        if (cancelled) return
        setAdminAgentsPresenceError(e?.message || 'Unable to load agents')
        setAdminAgentsPresence(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, role, activePanel])

  useEffect(() => {
    if (!token) return
    if (role !== 'admin') return

    let cancelled = false
    setAnalyticsError('')
    Promise.all([
      apiFetch('/api/analytics/summary/', { token }),
      apiFetch('/api/analytics/resolution/', { token }),
      apiFetch(`/api/analytics/volume/?days=${analyticsDays}`, { token }),
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
  }, [token, role, analyticsDays])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: UI.colors.bg,
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: UI.colors.text,
      }}
    >
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: ${UI.colors.bg};
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        }
        #root {
          min-height: 100vh;
          background: ${UI.colors.bg};
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        }
        .ta-field::placeholder {
          color: ${UI.colors.muted};
        }
        .ta-field:hover:not(:disabled) {
          border-color: ${UI.colors.border} !important;
          box-shadow: 0 1px 2px ${UI.colors.shadow} !important;
        }
        select.ta-field {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          padding-right: 34px !important;
          background-image:
            linear-gradient(45deg, transparent 50%, ${UI.colors.muted} 50%),
            linear-gradient(135deg, ${UI.colors.muted} 50%, transparent 50%),
            linear-gradient(to right, transparent, transparent);
          background-position:
            calc(100% - 18px) 50%,
            calc(100% - 13px) 50%,
            calc(100% - 2.2em) 50%;
          background-size: 5px 5px, 5px 5px, 1px 1.6em;
          background-repeat: no-repeat;
        }
        select.ta-field:disabled {
          background-image: none;
        }
      `}</style>
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          borderBottom: `1px solid ${UI.colors.border}`,
          background: UI.colors.surface,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.2 }}>Ticket Automation</div>
          <div style={{ color: UI.colors.muted, fontSize: 11 }}>Health: {health}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="ghost" onClick={toggleTheme} style={{ padding: '6px 10px' }}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          {user ? (
            <>
              <div style={{ color: UI.colors.text, fontWeight: 650, fontSize: 12 }}>
                {user.username} {user.profile?.role ? `(${user.profile.role})` : ''}
              </div>
              <Button variant="ghost" onClick={logout} style={{ padding: '6px 10px' }}>
                Logout
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div
        style={
          !token || !user
            ? { maxWidth: 1400, margin: '0 auto', padding: 16 }
            : { width: '100%', margin: 0, padding: 16 }
        }
      >
        {!token || !user ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr minmax(360px, 460px)',
              gap: 16,
              alignItems: 'stretch',
              minHeight: 'calc(100vh - 120px)',
            }}
          >
            <div
              style={{
                borderRadius: UI.radius,
                background:
                  theme === 'dark'
                    ? UI.colors.sidebarBg
                    : `linear-gradient(135deg, ${UI.colors.primaryBg} 0%, rgba(255,255,255,0.92) 85%, rgba(255,255,255,0.98) 100%)`,
                border: `1px solid ${theme === 'dark' ? UI.colors.sidebarBorder : UI.colors.border}`,
                boxShadow: theme === 'dark' ? '0 16px 40px rgba(0,0,0,0.35)' : `0 16px 40px ${UI.colors.shadowStrong}`,
                padding: 22,
                color: theme === 'dark' ? UI.colors.sidebarText : UI.colors.text,
                display: 'grid',
                alignContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>Ticket Automation</div>
                <div style={{ marginTop: 10, color: theme === 'dark' ? UI.colors.sidebarMuted : UI.colors.muted, fontSize: 13, lineHeight: '20px' }}>
                  AI-assisted customer support with real-time ticket updates, auto-assignment, search, analytics and email notifications.
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, color: theme === 'dark' ? UI.colors.sidebarMuted : UI.colors.muted }}>Backend health</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{health}</div>
              </div>
            </div>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Welcome back</div>
                  <div style={{ color: UI.colors.muted, marginTop: 6, fontSize: 13 }}>Sign in or create a customer account.</div>
                </div>
              </div>

              <ActionRow style={{ marginTop: 14 }}>
                <Button
                  type="button"
                  variant={authTab === 'login' ? 'primary' : 'ghost'}
                  onClick={() => setAuthTab('login')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant={authTab === 'register' ? 'primary' : 'ghost'}
                  onClick={() => setAuthTab('register')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Create account
                </Button>
              </ActionRow>

              {authTab === 'login' ? (
                <form onSubmit={login} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                  <Field label="Username">
                    <Input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="username" required />
                  </Field>
                  <Field label="Password">
                    <Input
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="password"
                      type="password"
                      required
                    />
                  </Field>
                  <Button type="submit">Login</Button>
                  {loginError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{loginError}</div> : null}
                </form>
              ) : (
                <form onSubmit={register} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                  <Field label="Username">
                    <Input value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} placeholder="username" />
                  </Field>
                  <Field label="Email" hint="Optional">
                    <Input
                      value={registerEmail}
                      onChange={(e) => {
                        setRegisterEmail(e.target.value)
                        setRegisterOtpSent(false)
                        setRegisterOtpCode('')
                        setRegisterVerificationToken('')
                      }}
                      placeholder="email"
                    />
                  </Field>
                  {registerEmail.trim() ? (
                    <Field label="Email OTP" hint={registerVerificationToken ? 'Verified' : registerOtpSent ? 'Check your inbox' : 'Click Create to send OTP'}>
                      <Input
                        value={registerOtpCode}
                        onChange={(e) => setRegisterOtpCode(e.target.value)}
                        placeholder="6-digit code"
                        disabled={!!registerVerificationToken}
                      />
                    </Field>
                  ) : null}
                  <Field label="Password">
                    <Input value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} placeholder="password" type="password" />
                  </Field>
                  <Button type="submit" disabled={registerOtpLoading}>
                    {registerOtpLoading ? 'Working…' : 'Create'}
                  </Button>
                  {registerError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{registerError}</div> : null}
                </form>
              )}
            </Card>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '260px 380px minmax(0, 760px)',
              gap: 12,
              alignItems: 'stretch',
              justifyContent: 'start',
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 72,
                alignSelf: 'start',
                height: 'calc(100vh - 116px)',
                overflow: 'auto',
                borderRadius: UI.radius,
                background: UI.colors.sidebarBg,
                border: `1px solid ${UI.colors.sidebarBorder}`,
                boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 12, color: UI.colors.sidebarMuted, fontWeight: 800, marginBottom: 10 }}>Views</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <SidebarItem active={activePanel === 'tickets'} onClick={() => setActivePanel('tickets')}>
                    Tickets
                  </SidebarItem>
                  {role === 'agent' || role === 'admin' ? (
                    <SidebarItem active={activePanel === 'agent_queue'} onClick={() => setActivePanel('agent_queue')}>
                      Agent queue
                    </SidebarItem>
                  ) : null}
                  {role === 'customer' ? (
                    <SidebarItem active={activePanel === 'new_ticket'} onClick={() => setActivePanel('new_ticket')}>
                      New ticket
                    </SidebarItem>
                  ) : null}
                  {role === 'agent' || role === 'admin' ? (
                    <SidebarItem active={activePanel === 'presence'} onClick={() => setActivePanel('presence')}>
                      Agent presence
                    </SidebarItem>
                  ) : null}
                  {role === 'admin' ? (
                    <>
                      <SidebarItem active={activePanel === 'admin_users'} onClick={() => setActivePanel('admin_users')}>
                        Admin: Users
                      </SidebarItem>
                      <SidebarItem active={activePanel === 'admin_analytics'} onClick={() => setActivePanel('admin_analytics')}>
                        Admin: Analytics (Dashboard)
                      </SidebarItem>
                    </>
                  ) : null}
                </div>

                <div style={{ marginTop: 14, borderTop: `1px solid ${UI.colors.sidebarBorder}`, paddingTop: 14 }}>
                  {activePanel === 'presence' && (role === 'agent' || role === 'admin') ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontWeight: 900, color: UI.colors.sidebarText }}>Availability</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>
                          {availability?.is_available ? 'Online' : 'Offline'}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: availability?.is_available ? UI.colors.success : UI.colors.sidebarMuted,
                            background: availability?.is_available ? UI.colors.primaryBg : 'rgba(255,255,255,0.08)',
                            border: `1px solid ${UI.colors.sidebarBorder}`,
                            borderRadius: 999,
                            padding: '4px 10px',
                          }}
                        >
                          {availability?.is_available ? 'Online' : 'Offline'}
                        </div>
                      </div>

                      <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>
                        Active: {availability?.active_assigned_count ?? '—'} / {availability?.capacity ?? '—'}
                      </div>
                      <ActionRow style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                        <Button
                          variant="primary"
                          onClick={() => toggleAvailability(true)}
                          style={{ padding: '8px 10px', width: '100%' }}
                          disabled={
                            Boolean(availability?.is_available) ||
                            (typeof availability?.active_assigned_count === 'number' &&
                              typeof availability?.capacity === 'number' &&
                              availability.capacity > 0 &&
                              availability.active_assigned_count >= availability.capacity)
                          }
                        >
                          Go online
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => toggleAvailability(false)}
                          style={{ padding: '8px 10px', width: '100%', border: `1px solid ${UI.colors.sidebarBorder}`, background: 'rgba(255,255,255,0.06)', color: UI.colors.sidebarText }}
                          disabled={!Boolean(availability?.is_available)}
                        >
                          Go offline
                        </Button>
                      </ActionRow>
                      {typeof availability?.active_assigned_count === 'number' &&
                      typeof availability?.capacity === 'number' &&
                      availability.capacity > 0 &&
                      availability.active_assigned_count >= availability.capacity ? (
                        <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>
                          You are at capacity. Resolve/close a ticket to go online again.
                        </div>
                      ) : null}

                      {role === 'admin' ? (
                        <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
                          <div style={{ fontWeight: 900, color: UI.colors.sidebarText }}>Agents</div>
                          {adminAgentsPresenceError ? (
                            <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>{adminAgentsPresenceError}</div>
                          ) : null}
                          {!adminAgentsPresence && !adminAgentsPresenceError ? (
                            <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>Loading agents…</div>
                          ) : null}
                          {Array.isArray(adminAgentsPresence?.agents) && adminAgentsPresence.agents.length === 0 ? (
                            <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>No agents found.</div>
                          ) : null}
                          {Array.isArray(adminAgentsPresence?.agents)
                            ? adminAgentsPresence.agents.map((a) => {
                                const online = Boolean(a?.is_available)
                                const active = typeof a?.active_assigned_count === 'number' ? a.active_assigned_count : null
                                const cap = typeof a?.capacity === 'number' ? a.capacity : null
                                return (
                                  <div
                                    key={a.id}
                                    style={{
                                      border: `1px solid ${UI.colors.sidebarBorder}`,
                                      borderRadius: 12,
                                      padding: 10,
                                      background: 'rgba(255,255,255,0.06)',
                                      display: 'grid',
                                      gap: 6,
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                                      <div style={{ fontSize: 12, fontWeight: 900, color: UI.colors.sidebarText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {a?.username || '—'}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 11,
                                          fontWeight: 900,
                                          color: online ? UI.colors.success : UI.colors.sidebarMuted,
                                          background: online ? UI.colors.primaryBg : 'rgba(255,255,255,0.08)',
                                          border: `1px solid ${UI.colors.sidebarBorder}`,
                                          borderRadius: 999,
                                          padding: '3px 8px',
                                          flex: '0 0 auto',
                                        }}
                                      >
                                        {online ? 'Online' : 'Offline'}
                                      </div>
                                    </div>
                                    {a?.email ? <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>{a.email}</div> : null}
                                    <div style={{ color: UI.colors.sidebarMuted, fontSize: 12 }}>
                                      Active: {active ?? '—'} / {cap ?? '—'}
                                    </div>
                                  </div>
                                )
                              })
                            : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {activePanel === 'admin_analytics' && role === 'admin' ? (
              <div style={{ gridColumn: '2 / span 2' }}>
                <Card>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        border: `1px solid ${UI.colors.border}`,
                        background: `linear-gradient(135deg, ${UI.colors.primaryBg} 0%, rgba(41,51,37,0.02) 100%)`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Analytics Dashboard</div>
                          <div style={{ fontSize: 13, color: UI.colors.muted, maxWidth: 520, lineHeight: '18px' }}>
                            Track volume, resolution speed, and status breakdown.
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
                          <Select
                            value={String(analyticsDays)}
                            onChange={(e) => setAnalyticsDays(parseInt(e.target.value, 10) || 30)}
                            style={{ height: 36, paddingTop: 8, paddingBottom: 8 }}
                          >
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                          </Select>
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
                              apiFetch(`/api/analytics/volume/?days=${analyticsDays}`, { token })
                                .then((v) => setAnalyticsVolume(v))
                                .catch((e) => setAnalyticsError(e.message))
                            }}
                            style={{ height: 36, padding: '6px 12px' }}
                          >
                            Refresh
                          </Button>
                        </div>
                      </div>
                    </div>

                    {analyticsError ? (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: `1px solid ${UI.colors.border}`,
                          background: 'rgba(220, 38, 38, 0.06)',
                          color: UI.colors.danger,
                          fontSize: 13,
                        }}
                      >
                        {analyticsError}
                      </div>
                    ) : null}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: `1px solid ${UI.colors.border}`,
                          background: UI.colors.surface2,
                          boxShadow: `0 10px 24px ${UI.colors.shadow}`,
                        }}
                      >
                        <div style={{ color: UI.colors.muted, fontSize: 12 }}>Total tickets</div>
                        <div style={{ fontSize: 26, fontWeight: 950, marginTop: 8, letterSpacing: 0.2 }}>{analyticsSummary?.total ?? '—'}</div>
                      </div>
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: `1px solid ${UI.colors.border}`,
                          background: UI.colors.surface2,
                          boxShadow: `0 10px 24px ${UI.colors.shadow}`,
                        }}
                      >
                        <div style={{ color: UI.colors.muted, fontSize: 12 }}>Open / Unresolved</div>
                        <div style={{ fontSize: 26, fontWeight: 950, marginTop: 8, letterSpacing: 0.2 }}>{analyticsSummary?.open_like ?? '—'}</div>
                      </div>
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: `1px solid ${UI.colors.border}`,
                          background: UI.colors.surface2,
                          boxShadow: `0 10px 24px ${UI.colors.shadow}`,
                        }}
                      >
                        <div style={{ color: UI.colors.muted, fontSize: 12 }}>Avg resolution</div>
                        <div style={{ fontSize: 18, fontWeight: 950, marginTop: 10 }}>
                          {typeof analyticsResolution?.avg_resolution_seconds === 'number'
                            ? `${Math.round(analyticsResolution.avg_resolution_seconds / 3600)}h`
                            : '—'}
                        </div>
                        <div style={{ color: UI.colors.muted, fontSize: 12, marginTop: 6 }}>from {analyticsResolution?.resolved_count ?? '—'} resolved</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 10, alignItems: 'start' }}>
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: `1px solid ${UI.colors.border}`,
                          background: UI.colors.surface2,
                          boxShadow: `0 10px 24px ${UI.colors.shadow}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                          <div style={{ fontWeight: 950, fontSize: 12, color: UI.colors.text }}>Volume (last {analyticsDays} days)</div>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>{analyticsVolume?.series?.length ? `${analyticsVolume.series.length} points` : ''}</div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          {(() => {
                            const series = analyticsVolume?.series || []
                            if (!series.length) {
                              return <div style={{ color: UI.colors.muted, fontSize: 12, padding: '16px 0' }}>No data yet</div>
                            }
                            const w = 900
                            const h = 170
                            const pad = 10
                            const maxY = Math.max(1, ...series.map((p) => p.count || 0))
                            const pts = series.map((p, i) => {
                              const x = pad + (i * (w - pad * 2)) / Math.max(1, series.length - 1)
                              const y = pad + (h - pad * 2) * (1 - (p.count || 0) / maxY)
                              return `${x.toFixed(2)},${y.toFixed(2)}`
                            })
                            const last = series[series.length - 1]?.count ?? null
                            const sum = series.reduce((a, p) => a + (p.count || 0), 0)
                            return (
                              <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ borderRadius: 14, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface, padding: 10 }}>
                                  <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
                                    <polyline points={pts.join(' ')} fill="none" stroke={UI.colors.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                                    <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={UI.colors.border} strokeWidth="1" />
                                  </svg>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                  <div style={{ fontSize: 12, color: UI.colors.muted }}>Total: <span style={{ color: UI.colors.text, fontWeight: 900 }}>{sum}</span></div>
                                  <div style={{ fontSize: 12, color: UI.colors.muted }}>Latest: <span style={{ color: UI.colors.text, fontWeight: 900 }}>{last ?? '—'}</span></div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: `1px solid ${UI.colors.border}`,
                          background: UI.colors.surface2,
                          boxShadow: `0 10px 24px ${UI.colors.shadow}`,
                        }}
                      >
                        <div style={{ fontWeight: 950, fontSize: 12, color: UI.colors.text }}>By status</div>
                        <div style={{ marginTop: 12 }}>
                          {(() => {
                            const byStatus = analyticsSummary?.by_status || {}
                            const entries = Object.entries(byStatus)
                              .map(([k, v]) => [k, Number(v) || 0])
                              .sort((a, b) => b[1] - a[1])
                            const total = entries.reduce((a, [, v]) => a + v, 0)
                            if (!entries.length || total <= 0) {
                              return <div style={{ color: UI.colors.muted, fontSize: 12, padding: '16px 0' }}>No data yet</div>
                            }
                            const palette = ['#4CBB17', '#48872B', '#39542C', '#293325', '#0f766e', '#d97706', '#b91c1c', '#7c3aed']
                            const size = 128
                            const stroke = 16
                            const r = (size - stroke) / 2
                            const cx = size / 2
                            const cy = size / 2
                            const c = 2 * Math.PI * r
                            let acc = 0
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, alignItems: 'start' }}>
                                <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
                                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
                                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={UI.colors.border} strokeWidth={stroke} />
                                    {entries.slice(0, 8).map(([k, v], idx) => {
                                      const frac = v / total
                                      const len = c * frac
                                      const dash = `${len} ${c - len}`
                                      const offset = c * (1 - acc)
                                      acc += frac
                                      return (
                                        <circle
                                          key={k}
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke={palette[idx % palette.length]}
                                          strokeWidth={stroke}
                                          strokeLinecap="butt"
                                          strokeDasharray={dash}
                                          strokeDashoffset={offset}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                        />
                                      )
                                    })}
                                  </svg>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 950, color: UI.colors.text, lineHeight: '22px' }}>{total}</div>
                                    <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>tickets</div>
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gap: 10 }}>
                                  {entries.slice(0, 8).map(([k, v], idx) => {
                                    const pct = Math.round((v / total) * 100)
                                    const color = palette[idx % palette.length]
                                    return (
                                      <div key={k} style={{ display: 'grid', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 999, background: color, flex: '0 0 auto' }} />
                                            <div style={{ fontSize: 12, color: UI.colors.text, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</div>
                                          </div>
                                          <div style={{ fontSize: 12, color: UI.colors.muted, flex: '0 0 auto' }}>{v} ({pct}%)</div>
                                        </div>
                                        <div style={{ height: 9, borderRadius: 999, background: 'rgba(15, 23, 42, 0.08)', overflow: 'hidden', border: `1px solid ${UI.colors.border}` }}>
                                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {activePanel === 'admin_users' && role === 'admin' ? (
              <div style={{ gridColumn: '2 / span 2' }}>
                <Card style={{ maxWidth: 1120, margin: '0 auto' }}>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div
                      style={{
                        padding: 20,
                        borderRadius: 16,
                        border: `1px solid ${UI.colors.border}`,
                        background: `linear-gradient(135deg, ${UI.colors.primaryBg} 0%, rgba(41,51,37,0.00) 100%)`,
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: 0.2 }}>Admin: Users</div>
                      <div style={{ color: UI.colors.muted, fontSize: 14, marginTop: 6 }}>Create a new user account.</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {adminCreateOk ? (
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 14,
                              border: `1px solid ${UI.colors.border}`,
                              background: 'rgba(22, 163, 74, 0.08)',
                              color: UI.colors.success,
                              fontSize: 13,
                            }}
                          >
                            {adminCreateOk}
                          </div>
                        ) : null}
                        {adminCreateError ? (
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 14,
                              border: `1px solid ${UI.colors.border}`,
                              background: 'rgba(220, 38, 38, 0.06)',
                              color: UI.colors.danger,
                              fontSize: 13,
                            }}
                          >
                            {adminCreateError}
                          </div>
                        ) : null}

                        <form onSubmit={adminCreateUser} style={{ display: 'grid', gap: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                            <Field label="Username">
                              <Input value={adminNewUsername} onChange={(e) => setAdminNewUsername(e.target.value)} placeholder="username" required style={{ height: 50, padding: '13px 16px', borderRadius: 14, fontSize: 15 }} />
                            </Field>
                            <Field label="Email" hint="Optional">
                              <Input value={adminNewEmail} onChange={(e) => setAdminNewEmail(e.target.value)} placeholder="email" style={{ height: 50, padding: '13px 16px', borderRadius: 14, fontSize: 15 }} />
                            </Field>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                            <Field label="Password">
                              <Input value={adminNewPassword} onChange={(e) => setAdminNewPassword(e.target.value)} placeholder="password" type="password" required style={{ height: 50, padding: '13px 16px', borderRadius: 14, fontSize: 15 }} />
                            </Field>
                            <Field label="Role">
                              <Select value={adminNewRole} onChange={(e) => setAdminNewRole(e.target.value)} style={{ height: 50, padding: '13px 16px', borderRadius: 14, fontSize: 15 }}>
                                <option value="agent">agent</option>
                                <option value="admin">admin</option>
                                <option value="customer">customer</option>
                              </Select>
                            </Field>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                            <Button type="submit" style={{ padding: '12px 18px', borderRadius: 14, fontSize: 14, fontWeight: 900 }}>Create user</Button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {activePanel === 'agent_queue' && (role === 'agent' || role === 'admin') ? (
              <div style={{ gridColumn: '2 / span 2' }}>
                <Card>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 900 }}>Agent queue</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 2 }}>Sorted by: {agentQueueSort}</div>
                      </div>
                      <Select value={agentQueueSort} onChange={(e) => setAgentQueueSort(e.target.value)} style={{ height: 36, paddingTop: 8, paddingBottom: 8 }}>
                        <option value="oldest">Oldest</option>
                        <option value="priority">Priority</option>
                      </Select>
                    </div>

                    {(() => {
                      const grouped = {
                        OPEN: [],
                        ASSIGNED: [],
                        IN_PROGRESS: [],
                        WAITING_ON_CUSTOMER: [],
                        RESOLVED: [],
                        CLOSED: [],
                      }
                      for (const t of tickets) {
                        const k = t.status || 'OPEN'
                        if (!grouped[k]) grouped[k] = []
                        grouped[k].push(t)
                      }

                      const order = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']
                      return (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {order.map((k) => {
                            const list = sortTickets(grouped[k] || [], agentQueueSort)
                            if (list.length === 0) return null
                            return (
                              <div key={k} style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                  <div style={{ color: UI.colors.text, fontWeight: 950, fontSize: 12 }}>{k}</div>
                                  <div style={{ color: UI.colors.muted, fontSize: 12 }}>{list.length}</div>
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {list.slice(0, 40).map((t) => (
                                    <button
                                      key={t.id}
                                      onClick={() => setSelectedTicketId(t.id)}
                                      style={{
                                        textAlign: 'left',
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 12,
                                        border: `1px solid ${UI.colors.border}`,
                                        background: UI.colors.surface,
                                        color: UI.colors.text,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <div style={{ fontWeight: 900, fontSize: 13 }}>#{t.id} {t.subject}</div>
                                      <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{t.priority}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                </Card>
              </div>
            ) : null}

            {activePanel === 'new_ticket' && role === 'customer' ? (
              <div style={{ gridColumn: '2 / span 2' }}>
                <Card>
                  <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>New ticket</div>
                      <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 2 }}>Create a new support request.</div>
                    </div>
                    <form onSubmit={createTicket} style={{ display: 'grid', gap: 10 }}>
                      <Field label="Subject">
                        <Input value={newTicketSubject} onChange={(e) => setNewTicketSubject(e.target.value)} placeholder="Subject" required />
                      </Field>
                      <Field label="Description">
                        <div style={{ display: 'grid', gap: 8 }}>
                          <Textarea value={newTicketDescription} onChange={(e) => setNewTicketDescription(e.target.value)} placeholder="Description" rows={5} />
                          {sttSupported ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sttListening && sttTarget === 'new_ticket_description') stopStt()
                                  else startStt('new_ticket_description')
                                }}
                                title={sttListening && sttTarget === 'new_ticket_description' ? 'Stop voice' : 'Voice to text'}
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  border: `1px solid ${UI.colors.border}`,
                                  background: sttListening && sttTarget === 'new_ticket_description' ? UI.colors.primary : UI.colors.surface,
                                  boxShadow: `0 1px 2px ${UI.colors.shadow}`,
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <MicIcon active={sttListening && sttTarget === 'new_ticket_description'} />
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: UI.colors.muted }}>
                                  {sttListening && sttTarget === 'new_ticket_description' ? 'Listening…' : 'Voice input'}
                                </div>
                                {sttError ? <div style={{ fontSize: 12, color: UI.colors.danger, marginTop: 2 }}>{sttError}</div> : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </Field>
                      <Field label="Priority">
                        <Select value={newTicketPriority} onChange={(e) => setNewTicketPriority(e.target.value)}>
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="URGENT">URGENT</option>
                        </Select>
                      </Field>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button type="submit">Create</Button>
                      </div>
                    </form>
                  </div>
                </Card>
              </div>
            ) : null}

            {activePanel === 'tickets' || activePanel === 'presence' ? (
              <>
            <Card style={{ height: 'calc(100vh - 116px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>Tickets</div>
                  <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 2 }}>Filter, search and pick a ticket</div>
                </div>
                <Button variant="ghost" onClick={loadTickets} style={{ padding: '6px 10px' }}>
                  Refresh
                </Button>
              </div>
              {ticketsError ? <div style={{ color: UI.colors.danger, marginTop: 8 }}>{ticketsError}</div> : null}

              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8, color: UI.colors.text }}>Filters</div>
                  <ActionRow style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'stretch' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                      <option value="">All status</option>
                      <option value="OPEN">OPEN</option>
                      <option value="ASSIGNED">ASSIGNED</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="WAITING_ON_CUSTOMER">WAITING_ON_CUSTOMER</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </Select>
                  </div>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                      <option value="">All priority</option>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </Select>
                  </div>
                  {(role === 'admin' || role === 'agent') && (
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Input value={filterAssignedAgent} onChange={(e) => setFilterAssignedAgent(e.target.value)} placeholder="Assignee (id / username / email)" />
                    </div>
                  )}
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <Input type="date" value={filterCreatedFrom} onChange={(e) => setFilterCreatedFrom(e.target.value)} placeholder="From" />
                  </div>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <Input type="date" value={filterCreatedTo} onChange={(e) => setFilterCreatedTo(e.target.value)} placeholder="To" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      setFilterStatus('')
                      setFilterPriority('')
                      setFilterAssignedAgent('')
                      setFilterCreatedFrom('')
                      setFilterCreatedTo('')
                      await loadTickets()
                    }}
                    style={{ whiteSpace: 'nowrap', justifySelf: 'start' }}
                  >
                    Clear filters
                  </Button>
                  </ActionRow>
                </div>
              </div>

              <form onSubmit={searchTickets} style={{ marginTop: 12 }}>
                <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8, color: UI.colors.text }}>Search</div>
                  <ActionRow style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'stretch' }}>
                    <div style={{ minWidth: 0 }}>
                      <Input value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} placeholder="Search subject / description…" />
                    </div>
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
                  </ActionRow>
                </div>
              </form>

              <div
                style={{
                  marginTop: 12,
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                  border: `1px solid ${UI.colors.border}`,
                  borderRadius: 14,
                  background: UI.colors.surface,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr style={{ background: UI.colors.surface2 }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: UI.colors.muted, position: 'sticky', top: 0, background: UI.colors.surface2, borderBottom: `1px solid ${UI.colors.border}` }}>ID</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: UI.colors.muted, position: 'sticky', top: 0, background: UI.colors.surface2, borderBottom: `1px solid ${UI.colors.border}` }}>Subject</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: UI.colors.muted, position: 'sticky', top: 0, background: UI.colors.surface2, borderBottom: `1px solid ${UI.colors.border}` }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: UI.colors.muted, position: 'sticky', top: 0, background: UI.colors.surface2, borderBottom: `1px solid ${UI.colors.border}` }}>Priority</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: UI.colors.muted, position: 'sticky', top: 0, background: UI.colors.surface2, borderBottom: `1px solid ${UI.colors.border}` }}>Assignee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t, idx) => {
                      const active = selectedTicketId === t.id
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTicketId(t.id)}
                          style={{
                            cursor: 'pointer',
                            background: active ? UI.colors.primaryBg : idx % 2 === 1 ? 'rgba(41,51,37,0.03)' : UI.colors.surface,
                            transition: 'background 140ms ease, box-shadow 140ms ease',
                            boxShadow: active ? `inset 3px 0 0 ${UI.colors.primary}` : 'none',
                          }}
                          onMouseEnter={(e) => {
                            try {
                              e.currentTarget.style.background = active ? UI.colors.primaryBg : UI.colors.surface2
                            } catch {
                              // ignore
                            }
                          }}
                          onMouseLeave={(e) => {
                            try {
                              e.currentTarget.style.background = active ? UI.colors.primaryBg : UI.colors.surface
                            } catch {
                              // ignore
                            }
                          }}
                        >
                          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${UI.colors.border}`, fontWeight: 900, fontSize: 12 }}>#{t.id}</td>
                          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${UI.colors.border}`, fontSize: 13 }}>
                            <div style={{ fontWeight: 800 }}>{t.subject}</div>
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${UI.colors.border}` }}>
                            <StatusPill status={t.status} />
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${UI.colors.border}`, fontSize: 12, color: UI.colors.muted }}>{t.priority}</td>
                          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${UI.colors.border}`, fontSize: 12, color: UI.colors.muted }}>
                            {t.assigned_agent_username ?? t.assigned_agent ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card style={{ height: 'calc(100vh - 116px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!selectedTicket ? (
                <div style={{ color: UI.colors.muted }}>Select a ticket to view details.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, minWidth: 0, wordBreak: 'break-word', flex: '1 1 260px' }}>
                      #{selectedTicket.id} {selectedTicket.subject}
                    </div>
                    <StatusPill status={selectedTicket.status} />
                  </div>
                  <div style={{ color: UI.colors.muted, fontSize: 12 }}>{selectedTicket.description}</div>
                  <div style={{ color: UI.colors.muted, fontSize: 12 }}>
                    assigned_agent: {selectedTicket.assigned_agent_username ?? selectedTicket.assigned_agent ?? '—'}
                  </div>

                  {(role === 'agent' || role === 'admin') && (
                    <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: `1px solid ${UI.colors.border}`, background: UI.colors.surface2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>AI Draft</div>
                        <Button type="button" variant="primary" onClick={generateAIDraft} style={{ padding: '8px 10px' }} disabled={aiDraftLoading}>
                          {aiDraftLoading ? 'Generating…' : 'Generate'}
                        </Button>
                      </div>
                      <Textarea value={aiDraft} onChange={(e) => setAiDraft(e.target.value)} placeholder="AI suggested reply will appear here…" rows={2} />
                      <ActionRow>
                        <Button type="button" variant="ghost" onClick={() => setAiDraft('')} style={{ whiteSpace: 'nowrap' }}>
                          Clear
                        </Button>
                        <Button type="button" onClick={sendAIDraft} style={{ whiteSpace: 'nowrap' }}>
                          Send draft
                        </Button>
                      </ActionRow>
                      {aiDraftError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{aiDraftError}</div> : null}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>Conversation</div>
                    <div style={{ color: UI.colors.muted, fontSize: 12 }}>{messages.length} messages</div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gap: 10, paddingRight: 4 }}>
                    {messages.map((m) => (
                      (() => {
                        const author = m.author
                        const authorId =
                          author && typeof author === 'object' && 'id' in author ? author.id : author
                        const authorUsername =
                          author && typeof author === 'object' && 'username' in author ? author.username : author

                        const isMine =
                          (authorId !== null &&
                            authorId !== undefined &&
                            user?.id !== null &&
                            user?.id !== undefined &&
                            String(authorId) === String(user.id)) ||
                          (typeof authorUsername === 'string' && authorUsername === (user?.username || ''))
                        return (
                      <div
                        key={m.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMine ? '18px 1fr' : '1fr 18px',
                          gap: 10,
                          alignItems: 'start',
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: m.is_internal ? UI.colors.warning : UI.colors.primary,
                            marginTop: 6,
                            boxShadow: `0 0 0 4px ${
                              m.is_internal
                                ? 'rgba(217,119,6,0.14)'
                                : isMine
                                  ? UI.colors.primaryBg
                                  : UI.colors.primaryBg
                            }`,
                            gridColumn: isMine ? 1 : 2,
                            justifySelf: isMine ? 'start' : 'end',
                          }}
                        />
                        <div
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            background: m.is_internal ? UI.colors.surface : isMine ? UI.colors.primaryBg : UI.colors.surface,
                            border: `1px solid ${UI.colors.border}`,
                            gridColumn: isMine ? 2 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                            <div style={{ fontSize: 13, fontWeight: 900 }}>
                              {m.author ?? '—'}
                              <span style={{ fontSize: 12, color: UI.colors.muted, fontWeight: 650 }}> • {m.is_internal ? 'Internal note' : 'Public reply'}</span>
                            </div>
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 6, color: UI.colors.text }}>{m.body}</div>
                          {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                              {m.attachments.map((a) => (
                                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                                  <a href={toAbsoluteUrl(a.url)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: UI.colors.primary, textDecoration: 'none', fontWeight: 650 }}>
                                    {a.filename || 'attachment'}
                                  </a>
                                  {a.url ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}
                                      onClick={() => {
                                        setViewerAttachment(a)
                                        setViewerOpen(true)
                                      }}
                                    >
                                      View
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                        )
                      })()
                    ))}
                  </div>

                  <AttachmentViewer
                    open={viewerOpen}
                    attachment={viewerAttachment}
                    onClose={() => {
                      setViewerOpen(false)
                      setViewerAttachment(null)
                    }}
                  />

                  <form onSubmit={sendMessage} style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Reply…" rows={3} required />
                      {role === 'customer' && sttSupported ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (sttListening && sttTarget === 'reply') stopStt()
                              else startStt('reply')
                            }}
                            title={sttListening && sttTarget === 'reply' ? 'Stop voice' : 'Voice to text'}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              border: `1px solid ${UI.colors.border}`,
                              background: sttListening && sttTarget === 'reply' ? UI.colors.primary : UI.colors.surface,
                              boxShadow: `0 1px 2px ${UI.colors.shadow}`,
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <MicIcon active={sttListening && sttTarget === 'reply'} />
                          </button>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>
                            {sttListening && sttTarget === 'reply' ? 'Listening…' : 'Voice input'}
                          </div>
                        </div>
                      ) : null}
                      {role === 'customer' && sttSupported && sttError ? (
                        <div style={{ fontSize: 12, color: UI.colors.danger }}>{sttError}</div>
                      ) : null}
                    </div>
                    {sendMessageError ? <div style={{ color: UI.colors.danger, fontSize: 13 }}>{sendMessageError}</div> : null}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          try {
                            newMessageFilesInputRef.current?.click?.()
                          } catch {
                            // ignore
                          }
                        }}
                        style={{ padding: '8px 10px', borderRadius: 12 }}
                      >
                        Choose files
                      </Button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ color: UI.colors.muted, fontSize: 12, fontWeight: 650 }}>
                          {newMessageFiles?.length
                            ? `${newMessageFiles.length} file${newMessageFiles.length === 1 ? '' : 's'} selected`
                            : 'No files selected'}
                        </div>
                        {newMessageFiles?.length ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNewMessageFiles([])
                              try {
                                if (newMessageFilesInputRef.current) newMessageFilesInputRef.current.value = ''
                              } catch {
                                // ignore
                              }
                            }}
                            title="Remove attachments"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              border: `1px solid ${UI.colors.border}`,
                              background: UI.colors.surface2,
                              color: UI.colors.muted,
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                              lineHeight: '1px',
                              fontSize: 14,
                              fontWeight: 900,
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      {newMessageFiles?.length ? (
                        <div style={{ width: '100%', color: UI.colors.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {newMessageFiles.map((f) => f?.name || 'file').join(', ')}
                        </div>
                      ) : null}
                      <input
                        ref={newMessageFilesInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          setNewMessageFiles(files)
                        }}
                      />
                    </div>
                    {(role === 'agent' || role === 'admin') && (
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: UI.colors.text, fontSize: 13 }}>
                        <input type="checkbox" checked={newMessageInternal} onChange={(e) => setNewMessageInternal(e.target.checked)} />
                        Internal note
                      </label>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button type="submit">Send</Button>
                    </div>
                  </form>
                </div>
              )}
            </Card>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
