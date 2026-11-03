import { useEffect, useState } from 'react';
import './App.css';
import { api } from './api';
import Login from './Login';
import ProfilesAndFriends from './ProfilesAndFriends';

const CHANNELS = [
  { id: 1, name: '# general' },
];

function ChannelList({ channels, activeId, onSelect }) {
  return (
    <aside className="channel-list" aria-label="Channel list">
      <h2>Channels</h2>
      <ul>
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              className={channel.id === activeId ? 'channel active' : 'channel'}
              onClick={() => onSelect(channel.id)}
            >
              {channel.name}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function MessagesArea({ messages }) {
  return (
    <section className="messages" aria-label="Messages">
      {messages.map((message) => (
        <article key={message.id} className="message">
          <strong className="author">User {message.user_id}</strong>
          <p className="text">{message.text}</p>
        </article>
      ))}
    </section>
  );
}

function WarningArea({ warning }) {
  return (
    <div className="warning" aria-label="Warning area">
      <span className="warning-label">Warning:</span>
      <span className="warning-text">{warning}</span>
    </div>
  );
}

function MessageInput({ value, onChange, onSend, onImage, busy }) {
  return (
    <form
      className="input-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <textarea
        className="message-input"
        placeholder="Type a message..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
      <button type="button" className="image-button" onClick={onImage}>
        Image
      </button>
      <button type="submit" className="send-button" disabled={busy || !value.trim()}>
        {busy ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}

function Chat({ me, onProfileChange, onLogout }) {
  const [activeChannel, setActiveChannel] = useState(CHANNELS[0].id);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState('No warnings.');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadMessages() {
      try {
        const savedMessages = await api('/messages', {
          signal: controller.signal,
        });
        setMessages(savedMessages);
      } catch {
        if (!controller.signal.aborted) {
          setError('Could not load messages. Check that the backend is running.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadMessages();
    return () => controller.abort();
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const savedMessage = await api('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: activeChannel, text }),
      });
      setMessages((current) => [...current, savedMessage]);
      setDraft((current) => current.trim() === text ? '' : current);
      setWarning('No warnings.');
    } catch {
      setError('Could not send message. Your text has been kept so you can try again.');
    } finally {
      setSending(false);
    }
  };

  const handleImage = () => {
    setWarning('Image upload is not available yet.');
  };

  return (
    <div className="chat-app">
      <header className="app-header">
        <h1>SafeChat AI</h1>
        <span>{me.name}</span>
        <button type="button" onClick={onLogout}>Sign out</button>
      </header>
      <div className="chat-body">
        <ChannelList
          channels={CHANNELS}
          activeId={activeChannel}
          onSelect={setActiveChannel}
        />
        <main className="chat-main">
          {loading && <p role="status">Loading messages...</p>}
          {error && <p role="alert">{error}</p>}
          <MessagesArea messages={messages} />
          <WarningArea warning={warning} />
          <MessageInput
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onImage={handleImage}
            busy={sending || loading}
          />
        </main>
        <ProfilesAndFriends me={me} onProfileChange={onProfileChange} />
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/me')
      .then((user) => { if (active) setMe(user); })
      .catch((err) => { if (active && err.status !== 401) setError('Could not connect to SafeChat. Check the backend.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setError('');
    try {
      await api('/logout', { method: 'POST' });
      setMe(null);
    } catch {
      setError('Could not sign out. Please try again.');
    }
  }

  if (loading) return <p role="status">Loading...</p>;
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {me ? <Chat key={me.id} me={me} onProfileChange={setMe} onLogout={logout} /> : (
        <Login onLogin={(user) => { setError(''); setMe(user); }} />
      )}
    </>
  );
}
