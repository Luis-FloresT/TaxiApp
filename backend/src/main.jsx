import React from 'react'
import ReactDOM from 'react-dom/client'
import { io } from 'socket.io-client'
import './styles.css'

const API_URL = 'http://localhost:3000'
const socket = io(API_URL, { transports: ['websocket', 'polling'] })

function App() {
  const [chats, setChats] = React.useState([])
  const [agents, setAgents] = React.useState([])
  const [selectedChat, setSelectedChat] = React.useState(null)
  const [messages, setMessages] = React.useState([])
  const [text, setText] = React.useState('')
  const [status, setStatus] = React.useState('Cargando panel...')

  const loadChats = async () => {
    const res = await fetch(`${API_URL}/chats`)
    const data = await res.json()
    setChats(data)
    if (!selectedChat && data.length) setSelectedChat(data[0])
  }

  const loadAgents = async () => {
    const res = await fetch(`${API_URL}/agents`)
    const data = await res.json()
    setAgents(data)
  }

  const loadMessages = async (chatId) => {
    if (!chatId) return
    const res = await fetch(`${API_URL}/chats/${chatId}/messages`)
    const data = await res.json()
    setMessages(data)
  }

  React.useEffect(() => {
    Promise.all([loadChats(), loadAgents()])
      .then(() => setStatus('Panel conectado al backend local'))
      .catch(() => setStatus('No se pudo conectar con el backend'))
  }, [])

  React.useEffect(() => {
    if (selectedChat?.id) loadMessages(selectedChat.id)
  }, [selectedChat?.id])

  React.useEffect(() => {
    socket.on('connect', () => setStatus('Tiempo real activo'))
    socket.on('disconnect', () => setStatus('Socket desconectado'))
    socket.on('new_message', (payload) => {
      loadChats()
      if (selectedChat?.id === payload.chatId) loadMessages(payload.chatId)
    })
    socket.on('message_sent', ({ chatId }) => {
      loadChats()
      if (selectedChat?.id === chatId) loadMessages(chatId)
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('new_message')
      socket.off('message_sent')
    }
  }, [selectedChat?.id])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim() || !selectedChat) return

    await fetch(`${API_URL}/chats/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: selectedChat.phone_number,
        text,
        chatId: selectedChat.id
      })
    })

    setText('')
    loadMessages(selectedChat.id)
    loadChats()
  }

  const assignAgent = async (agentId) => {
    if (!selectedChat) return

    await fetch(`${API_URL}/chats/${selectedChat.id}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId })
    })

    await loadChats()
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">T</div>
          <div>
            <h1>Taxi WhatsApp</h1>
            <p>{status}</p>
          </div>
        </div>

        <div className="sidebar-header">
          <h2>Chats</h2>
          <span>{chats.length}</span>
        </div>

        <div className="chat-list">
          {chats.map((chat) => (
            <button
              key={chat.id}
              className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
              onClick={() => setSelectedChat(chat)}
            >
              <div className="chat-avatar">
                {(chat.contact_name || '?').slice(0, 1).toUpperCase()}
              </div>

              <div className="chat-meta">
                <div className="chat-topline">
                  <strong>{chat.contact_name || 'Sin nombre'}</strong>
                  <span className={`pill ${chat.status}`}>{chat.status}</span>
                </div>
                <small>{chat.phone_number}</small>
                <p>{chat.last_message || 'Sin mensajes todavía'}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="conversation">
        {selectedChat ? (
          <>
            <header className="conversation-header">
              <div>
                <h2>{selectedChat.contact_name || 'Contacto'}</h2>
                <p>{selectedChat.phone_number}</p>
              </div>

              <div className="agent-badge">
                {selectedChat.agent_name
                  ? `Asignado a ${selectedChat.agent_name}`
                  : 'Sin asignar'}
              </div>
            </header>

            <section className="messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`bubble-row ${msg.from_agent ? 'outgoing' : 'incoming'}`}
                >
                  <div className={`bubble ${msg.from_agent ? 'agent' : 'client'}`}>
                    <p>{msg.content}</p>
                    <span>{new Date(msg.timestamp).toLocaleString('es-EC')}</span>
                  </div>
                </div>
              ))}
            </section>

            <form className="composer" onSubmit={handleSend}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe una respuesta..."
              />
              <button type="submit">Enviar</button>
            </form>
          </>
        ) : (
          <div className="empty-state">No hay chats todavía</div>
        )}
      </main>

      <aside className="details-panel">
        <h3>Operadores</h3>

        <div className="agents-list">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className="agent-card"
              onClick={() => assignAgent(agent.id)}
            >
              <strong>{agent.name}</strong>
              <span>{agent.email}</span>
            </button>
          ))}
        </div>

        <div className="help-box">
          <h4>Prueba local</h4>
          <p>Envía mensajes simulados a /webhook para ver cómo aparecen aquí en tiempo real.</p>
        </div>
      </aside>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)