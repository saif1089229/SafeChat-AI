import { useEffect, useRef, useState } from 'react';
import './App.css';
import AdminDashboard from './AdminDashboard';
import { API_URL, api } from './api';
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

function ReportForm({ onSend, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <form className="report-form" onSubmit={(e) => { e.preventDefault(); onSend(reason); }}>
      <input
        aria-label="Report reason"
        placeholder="Why are you reporting this message?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        autoFocus
      />
      <button type="submit" disabled={!reason.trim()}>Send report</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function MessagesArea({ messages, userName, meId, reportingId, onReport, onSendReport, onCancelReport }) {
  const listRef = useRef(null);

  // Keep the newest message in view when one arrives.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  return (
    <section className="messages" aria-label="Messages" ref={listRef}>
      {messages.map((message) => {
        const imageUrl = message.image_path && `${API_URL}/images/${message.image_path}`;
        return (
          <article key={message.id} className={message.user_id === meId ? 'message mine' : 'message'}>
            <strong className="author">{userName(message.user_id)}</strong>
            <time className="time" dateTime={message.created_at}>
              {new Date(message.created_at).toLocaleString()}
            </time>
            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noreferrer" title="Open full size">
                <img className="message-image" src={imageUrl} alt={`Image from ${userName(message.user_id)}`} />
              </a>
            )}
            {message.text && <p className="text">{message.text}</p>}
            {message.user_id !== meId && reportingId !== message.id && (
              <button type="button" className="report-button" onClick={() => onReport(message.id)}>Report</button>
            )}
            {reportingId === message.id && (
              <ReportForm onSend={(reason) => onSendReport(message.id, reason)} onCancel={onCancelReport} />
            )}
          </article>
        );
      })}
    </section>
  );
}

function WarningArea({ warning, busy, onEdit, onRewrite, onChooseImage, onSendAnyway }) {
  if (!warning) return null;
  return (
    <div className="warning" aria-label="Warning area" role="alert">
      <span className="warning-label">Warning:</span>
      <span className="warning-text">{warning.text}</span>
      {warning.moderated && (
        <div className="warning-actions">
          {warning.image ? (
            <button type="button" onClick={onChooseImage}>Choose another image</button>
          ) : (
            <>
              <button type="button" onClick={onEdit}>Edit message</button>
              <button type="button" disabled={busy} onClick={onRewrite}>Safe Rewrite</button>
            </>
          )}
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
  const [notice, setNotice] = useState('');
  const [image, setImage] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [reportingId, setReportingId] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

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

    // Check for new messages every few seconds so other people's messages appear.
    loadMessages();
    const timer = setInterval(loadMessages, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [activeChannel]);

  // New direct chats opened by a friend appear without a reload.
  // A failed check is simply tried again on the next tick.
  useEffect(() => {
    const timer = setInterval(() => {
      api('/channels').then(setChannels).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const selectChannel = (id) => {
    if (id === activeChannel) return;
    setActiveChannel(id);
    setMessages([]);
    setLoading(true);
    setWarning(null);
    setError('');
    setNotice('');
    setReportingId(null);
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

  // The regular refresh may already have loaded the message we just sent.
  const addMessage = (savedMessage) => {
    setMessages((current) => current.some((m) => m.id === savedMessage.id) ? current : [...current, savedMessage]);
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
      addMessage(savedMessage);
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

  const chooseImage = () => fileInputRef.current?.click();

  const clearImage = () => {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
  };

  const handleImageChosen = (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    clearImage();
    setImage({ file, url: URL.createObjectURL(file) });
    setWarning(null);
    setError('');
  };

  const sendImage = async (confirm = false) => {
    if (!image || sending) return;
    setSending(true);
    setError('');
    const form = new FormData();
    form.append('channel_id', activeChannel);
    form.append('image', image.file);
    form.append('confirm', confirm);
    try {
      const savedMessage = await api('/messages/image', { method: 'POST', body: form });
      addMessage(savedMessage);
      clearImage();
      setWarning(null);
    } catch (err) {
      if (err.status === 409 || err.status === 422) {
        setWarning({ text: err.message, moderated: true, canSend: err.status === 409, image: true });
      } else {
        setError(err.status ? err.message : 'Could not send image. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const reportMessage = async (messageId, reason) => {
    setError('');
    setNotice('');
    try {
      await api('/reports', { method: 'POST', body: JSON.stringify({ message_id: messageId, reason }) });
      setReportingId(null);
      setNotice('Report sent. An admin will review it.');
    } catch (err) {
      setError(err.message);
    }
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
        {me.role === 'admin' && (
          <button type="button" onClick={() => setShowAdmin((open) => !open)}>
            {showAdmin ? 'Back to chat' : 'Admin dashboard'}
          </button>
        )}
        {!showAdmin && (
          <button type="button" onClick={() => setShowPanel((open) => !open)}>
            {showPanel ? 'Hide profile' : 'Profile and friends'}
          </button>
        )}
        <button type="button" onClick={onLogout}>Sign out</button>
      </header>
      {showAdmin ? <AdminDashboard userName={userName} /> : (
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
            {notice && <p role="status">{notice}</p>}
            <MessagesArea
              messages={messages}
              userName={userName}
              meId={me.id}
              reportingId={reportingId}
              onReport={setReportingId}
              onSendReport={reportMessage}
              onCancelReport={() => setReportingId(null)}
            />
            <WarningArea
              warning={warning}
              busy={sending}
              onEdit={handleEdit}
              onRewrite={handleRewrite}
              onChooseImage={chooseImage}
              onSendAnyway={() => (warning?.image ? sendImage(true) : handleSend(true))}
            />
            {image && (
              <div className="image-preview">
                <img src={image.url} alt="Selected image preview" />
                <button type="button" disabled={sending} onClick={() => sendImage()}>Send image</button>
                <button type="button" disabled={sending} onClick={clearImage}>Cancel</button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={handleImageChosen}
            />
            <MessageInput
              value={draft}
              onChange={handleDraftChange}
              onSend={() => handleSend()}
              onImage={chooseImage}
              busy={sending || loading}
              inputRef={inputRef}
            />
          </main>
          {showPanel && <ProfilesAndFriends me={me} onProfileChange={onProfileChange} onMessage={openDirectChat} />}
        </div>
      )}
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
