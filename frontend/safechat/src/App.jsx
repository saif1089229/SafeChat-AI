import { useState } from 'react';
import './App.css';

const SAMPLE_CHANNELS = [
  { id: 1, name: '# general' },
  { id: 2, name: '# announcements' },
  { id: 3, name: '# random' },
];

const SAMPLE_MESSAGES = [
  { id: 1, author: 'Aisha', text: 'Hello SafeChat AI!' },
  { id: 2, author: 'Omar', text: 'Welcome to the team channel.' },
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
          <strong className="author">{message.author}</strong>
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

function MessageInput({ value, onChange, onSend, onImage }) {
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
      <button type="submit" className="send-button">
        Send
      </button>
    </form>
  );
}

export default function App() {
  const [activeChannel, setActiveChannel] = useState(SAMPLE_CHANNELS[0].id);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(SAMPLE_MESSAGES);
  const [warning, setWarning] = useState('No warnings.');

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages([...messages, { id: Date.now(), author: 'You', text }]);
    setDraft('');
    setWarning('No warnings.');
  };

  const handleImage = () => {
    setWarning('Image upload is not available yet.');
  };

  return (
    <div className="chat-app">
      <header className="app-header">
        <h1>SafeChat AI</h1>
      </header>
      <div className="chat-body">
        <ChannelList
          channels={SAMPLE_CHANNELS}
          activeId={activeChannel}
          onSelect={setActiveChannel}
        />
        <main className="chat-main">
          <MessagesArea messages={messages} />
          <WarningArea warning={warning} />
          <MessageInput
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onImage={handleImage}
          />
        </main>
      </div>
    </div>
  );
}
