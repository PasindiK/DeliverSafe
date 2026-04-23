import { useMemo, useState, type FormEvent } from 'react'
import { askVirtualAssistant } from '../../services/chatService'

interface ChatMessage {
  id: number
  role: 'agent' | 'user'
  text: string
}

const WELCOME_MESSAGE =
  'Hi, I am your Virtual Assistant. Ask me about trends, anomalies, or how to navigate this dashboard.'

function DeliverSafeAgentWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'agent', text: WELCOME_MESSAGE },
  ])

  const messageCountLabel = useMemo(() => {
    const count = messages.length
    return count === 1 ? '1 message' : `${count} messages`
  }, [messages.length])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = inputValue.trim()
    if (!text || isSending) return

    const userMessageId = Date.now()
    setMessages((current) => [...current, { id: userMessageId, role: 'user', text }])
    setInputValue('')

    try {
      setIsSending(true)
      const response = await askVirtualAssistant({
        message: text,
        dashboardState: {
          path: window.location.pathname,
          hours: 24,
        },
      })

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'agent',
          text: response.answer || 'I could not generate a response right now.',
        },
      ])
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : 'Unable to reach the assistant service right now.'
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'agent',
          text: `Assistant error: ${fallbackMessage}`,
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const clearChat = () => {
    if (isSending) return
    setMessages([{ id: Date.now(), role: 'agent', text: WELCOME_MESSAGE }])
  }

  return (
    <>
      <button
        type="button"
        className={`agent-bubble ${isOpen ? 'agent-bubble-open' : ''}`}
        onClick={() => setIsOpen(true)}
        aria-label="Open DeliverSafe Agent chat"
      >
        <span className="agent-avatar" aria-hidden="true">
          <span className="agent-hair" />
          <span className="agent-face">
            <span className="agent-eye" />
            <span className="agent-eye" />
            <span className="agent-mouth" />
          </span>
          <span className="agent-pizza">
            <span className="agent-pizza-pepperoni" />
            <span className="agent-pizza-pepperoni" />
          </span>
          <span className="agent-torso" />
        </span>
        <span className="agent-bubble-text">
          <strong>DeliverSafe Agent</strong>
          <small>Tap to chat</small>
        </span>
      </button>

      <aside className={`agent-panel ${isOpen ? 'agent-panel-open' : ''}`} aria-hidden={!isOpen}>
        <header className="agent-panel-header">
          <div>
            <p className="agent-panel-title">DeliverSafe Agent</p>
            <p className="agent-panel-subtitle">Virtual Assistant</p>
          </div>
          <div className="agent-header-actions">
            <button
              type="button"
              className="agent-trash-btn"
              onClick={clearChat}
              aria-label="Clear chat"
              title="Clear chat"
              disabled={isSending}
            >
              <span aria-hidden="true" className="agent-trash-icon">🗑</span>
            </button>
            <button type="button" className="agent-close-btn" onClick={() => setIsOpen(false)} aria-label="Close chat">
              <span aria-hidden="true" className="agent-close-icon">×</span>
            </button>
          </div>
        </header>

        <div className="agent-chat-meta">{messageCountLabel}</div>

        <div className="agent-chat-body">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`agent-message ${message.role === 'user' ? 'agent-message-user' : 'agent-message-agent'}`}
            >
              {message.text}
            </div>
          ))}
        </div>

        <form className="agent-chat-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Ask Virtual Assistant..."
            className="agent-chat-input"
            disabled={isSending}
          />
          <button type="submit" className="agent-send-btn" disabled={isSending}>
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </aside>
    </>
  )
}

export default DeliverSafeAgentWidget
