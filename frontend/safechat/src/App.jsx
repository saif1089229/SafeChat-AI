import { useEffect, useRef, useState } from 'react';
import './App.css';
import { api } from './api';
import Login from './Login';
import ProfilesAndFriends from './ProfilesAndFriends';

function ChannelList({ channels, activeId, onSelect }) {
  const groups = [
    ['Channels', channels.filter((channel) => !channel.direct_user_id)],
    ['Direct messages', channels.filter((channel) => channel.direct_user_id)],
  ];
  return (
    <aside className="channel-list" aria-label="Channel list">
      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title}>
          <h2>{title}</h2>
          <ul>
            {list.map((channel) => (
              <li key={channel.id}>
                <button
                  type="button"
                  className={channel.id === activeId ? 'channel active' : 'channel'}
                  onClick={() => onSelect(channel.id)}
                >
                  {channel.direct_user_id ? channel.name : `# ${channel.name}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function MessagesArea({ messages, userName }) {
  return (
    <section className="messages" aria-label="Messages">
      {messages.map((message) => (
        <article key={message.id} className="message">
          <strong className="author">{userName(message.user_id)}</strong>
          <time className="time" dateTime={message.created_at}>
            {new Date(message.created_at).toLocaleString()}
          </time>
          <p className="text">{message.text}</p>
        </article>
      ))}
    </section>
  );
}

function WarningArea({ warning, busy, onEdit, onRewrite, onSendAnyway }) {
  return (
    <div className="warning" aria-label="Warning area" aria-live="polite">
      <span className="warning-label">Warning:</span>
      <span className="warning-text">{warning ? warning.text : 'No warnings.'}</span>
      {warning?.moderated && (
        <div className="warning-actions">
          <button type="button" onClick={onEdit}>Edit message</button>
          <button type="button" disabled={busy} onClick={onRewrite}>Safe Rewrite</button>
          {warning.canSend && (
            <button type="button" disabled={busy} onClick={onSendAnyway}>Send anyway</button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageInput({ value, onChange, onSend, onImage, busy, inputRef }) {
  return (
    <form
      className="input-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <textarea
        ref={inputRef}
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
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const [blockedIds, setBlockedIds] = useState([]);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([api('/channels'), api('/users'), api('/blocks')])
      .then(([savedChannels, people, blocked]) => {
        if (!active) return;
        setChannels(savedChannels);
        setUsers(people);
        setBlockedIds(blocked.map((user) => user.id));
        setActiveChannel(savedChannels[0]?.id ?? null);
      })
      .catch(() => {
        if (active) {
          setError('Could not load channels. Check that the backend is running.');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (activeChannel === null) return;
    const controller = new AbortController();

    async function loadMessages() {
      try {
        const savedMessages = await api(`/messages?channel_id=${activeChannel}`, {
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
  }, [activeChannel]);

  const selectChannel = (id) => {
    if (id === activeChannel) return;
    setActiveChannel(id);
    setMessages([]);
    setLoading(true);
    setWarning(null);
    setError('');
  };

  const openDirectChat = async (userId) => {
    setError('');
    try {
      const channel = await api('/direct-messages', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
      setChannels((list) => list.some((c) => c.id === channel.id) ? list : [...list, channel]);
      selectChannel(channel.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSend = async (confirm = false) => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const savedMessage = await api('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: activeChannel, text, confirm }),
      });
      setMessages((current) => [...current, savedMessage]);
      setDraft((current) => current.trim() === text ? '' : current);
      setWarning(null);
    } catch (err) {
      if (err.status === 409 || err.status === 422) {
        setWarning({ text: err.message, moderated: true, canSend: err.status === 409 });
      } else if (err.status === 403) {
        setError(err.message);
      } else {
        setError('Could not send message. Your text has been kept so you can try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleRewrite = async () => {
    setSending(true);
    setError('');
    try {
      const suggestion = await api('/rewrite', {
        method: 'POST',
        body: JSON.stringify({ text: draft.trim() }),
      });
      setDraft(suggestion.text);
      setWarning(null);
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleEdit = () => {
    setWarning(null);
    inputRef.current?.focus();
  };

  // A new draft has not been checked yet, so the old warning no longer applies.
  const handleDraftChange = (value) => {
    setDraft(value);
    if (warning?.moderated) setWarning(null);
  };

  const handleImage = () => {
    setWarning({ text: 'Image upload is not available yet.' });
  };

  const current = channels.find((channel) => channel.id === activeChannel);
  const directUserId = current?.direct_user_id;
  const isBlocked = blockedIds.includes(directUserId);
  const userName = (id) => id === me.id ? me.name : users.find((user) => user.id === id)?.name || `User ${id}`;

  const toggleBlock = async () => {
    setError('');
    try {
      if (isBlocked) {
        await api(`/blocks/${directUserId}`, { method: 'DELETE' });
        setBlockedIds((ids) => ids.filter((id) => id !== directUserId));
      } else {
        await api('/blocks', { method: 'POST', body: JSON.stringify({ user_id: directUserId }) });
        setBlockedIds((ids) => [...ids, directUserId]);
      }
    } catch (err) {
      setError(err.message);
    }
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
          channels={channels}
          activeId={activeChannel}
          onSelect={selectChannel}
        />
        <main className="chat-main">
          {current && (
            <div className="chat-title">
              <h2>{directUserId ? current.name : `# ${current.name}`}</h2>
              {directUserId && (
                <button type="button" onClick={toggleBlock}>{isBlocked ? 'Unblock' : 'Block'}</button>
              )}
            </div>
          )}
          {loading && <p role="status">Loading messages...</p>}
          {error && <p role="alert">{error}</p>}
          <MessagesArea messages={messages} userName={userName} />
          <WarningArea
            warning={warning}
            busy={sending}
            onEdit={handleEdit}
            onRewrite={handleRewrite}
            onSendAnyway={() => handleSend(true)}
          />
          <MessageInput
            value={draft}
            onChange={handleDraftChange}
            onSend={() => handleSend()}
            onImage={handleImage}
            busy={sending || loading}
            inputRef={inputRef}
          />
        </main>
        <ProfilesAndFriends me={me} onProfileChange={onProfileChange} onMessage={openDirectChat} />
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
