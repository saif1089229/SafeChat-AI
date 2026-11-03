import { useEffect, useState } from 'react';
import { api } from './api';

export default function ProfilesAndFriends({ me, onProfileChange }) {
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio);
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [people, accepted, pending] = await Promise.all([
      api('/users'), api('/friends'), api('/friend-requests'),
    ]);
    setUsers(people);
    setFriends(accepted);
    setRequests(pending);
  }

  useEffect(() => {
    let active = true;
    Promise.all([api('/users'), api('/friends'), api('/friend-requests')])
      .then(([people, accepted, pending]) => {
        if (active) {
          setUsers(people);
          setFriends(accepted);
          setRequests(pending);
        }
      })
      .catch(() => { if (active) setError('Could not load profiles and friends. Try Refresh.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function run(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    await run(async () => {
      const updated = await api('/me', {
        method: 'PATCH', body: JSON.stringify({ name, bio }),
      });
      onProfileChange(updated);
      setName(updated.name);
      setNotice('Profile saved.');
    });
  }

  async function respond(path, method) {
    await run(async () => {
      await api(path, { method });
      await refresh();
    });
  }

  const incoming = requests.filter((request) => request.recipient_id === me.id);
  const userName = (id) => users.find((user) => user.id === id)?.name || `User ${id}`;

  return (
    <aside className="profiles-panel" aria-label="Profiles and friends">
      <h2>My profile</h2>
      <form onSubmit={saveProfile}>
        <p>{me.email}</p>
        <label>Name
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
        </label>
        <label>Bio (optional)
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={300} rows={3} />
        </label>
        <button disabled={busy || !name.trim()}>Save profile</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading...</p>}
      <button type="button" disabled={busy} onClick={() => run(refresh)}>Refresh friends</button>

      <h2>Friend requests</h2>
      {incoming.length === 0 && <p>No incoming requests.</p>}
      {incoming.map((request) => (
        <div className="person" key={request.id}>
          <strong>{userName(request.sender_id)}</strong>
          <div className="person-actions">
            <button disabled={busy} onClick={() => respond(`/friend-requests/${request.id}/accept`, 'POST')}>Accept</button>
            <button disabled={busy} onClick={() => respond(`/friend-requests/${request.id}`, 'DELETE')}>Decline</button>
          </div>
        </div>
      ))}

      <h2>Friends</h2>
      {friends.length === 0 ? <p>No friends yet.</p> : (
        <ul>{friends.map((friend) => <li key={friend.id}>{friend.name}</li>)}</ul>
      )}

      <h2>People</h2>
      {users.filter((user) => user.id !== me.id).map((user) => {
        const isFriend = friends.some((friend) => friend.id === user.id);
        const pending = requests.find((request) => request.sender_id === user.id || request.recipient_id === user.id);
        return (
          <div className="person" key={user.id}>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
            {user.bio && <p>{user.bio}</p>}
            {isFriend ? <span>Friend</span> : pending ? (
              <span>{pending.sender_id === me.id ? 'Request sent' : 'Incoming request'}</span>
            ) : (
              <button disabled={busy} onClick={() => run(async () => {
                await api('/friend-requests', { method: 'POST', body: JSON.stringify({ recipient_id: user.id }) });
                await refresh();
              })}>Add friend</button>
            )}
          </div>
        );
      })}
    </aside>
  );
}
