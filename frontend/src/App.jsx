import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState('loading...')

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL
    fetch(`${baseUrl}/api/health/`)
      .then((r) => r.json())
      .then((d) => setHealth(d.status))
      .catch(() => setHealth('backend unreachable'))
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Smart Customer Support & Ticket Automation</h1>
      <p>Backend health: {health}</p>
    </div>
  )
}
