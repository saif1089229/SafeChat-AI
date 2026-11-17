import { useEffect, useState } from 'react';
import { api } from './api';

const NO_FILTERS = { category: '', decision: '', status: '', date_from: '', date_to: '' };

function formatTime(value) {
  return new Date(value).toLocaleString();
}

function PolicyRow({ policy, onSave, busy }) {
  const [warn, setWarn] = useState(String(policy.warn_threshold));
  const [block, setBlock] = useState(policy.block_threshold === null ? '' : String(policy.block_threshold));

  return (
    <tr>
      <td>{policy.name}</td>
      <td>
        <input type="number" min="0" max="1" step="0.05" value={warn} aria-label={`${policy.name} warn threshold`}
          onChange={(event) => setWarn(event.target.value)} />
      </td>
      <td>
        <input type="number" min="0" max="1" step="0.05" value={block} placeholder="off" aria-label={`${policy.name} block threshold`}
          onChange={(event) => setBlock(event.target.value)} />
      </td>
      <td>
        <button type="button" disabled={busy || warn === ''} onClick={() => onSave(policy.id, {
          warn_threshold: Number(warn),
          block_threshold: block === '' ? null : Number(block),
        })}>Save</button>
      </td>
    </tr>
  );
}

export default function AdminDashboard({ userName }) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [risk, setRisk] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  function fetchAll(activeFilters) {
    const query = new URLSearchParams(Object.entries(activeFilters).filter(([, value]) => value));
    return Promise.all([
      api(`/admin/events?${query}`), api('/admin/reports'), api('/admin/policies'),
      api('/admin/risk'), api('/admin/audit'),
    ]);
  }

  function show([flagged, reported, savedPolicies, riskRows, auditRows]) {
    setEvents(flagged);
    setReports(reported);
    setPolicies(savedPolicies);
    setRisk(riskRows);
    setAudit(auditRows);
  }

  useEffect(() => {
    let active = true;
    fetchAll(NO_FILTERS)
      .then((data) => { if (active) show(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  // Run an optional change, then reload everything with the current filters.
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      if (action) await action();
      show(await fetchAll(filters));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const setFilter = (name) => (event) => setFilters({ ...filters, [name]: event.target.value });
  const toggle = (status) => (status === 'open' ? 'reviewed' : 'open');

  return (
    <main className="admin">
      <h2>Admin dashboard</h2>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading...</p>}

      <section>
        <h3>Flagged events</h3>
        <form className="filters" onSubmit={(event) => { event.preventDefault(); run(); }}>
          <label>Category
            <select value={filters.category} onChange={setFilter('category')}>
              <option value="">All</option>
              {policies.map((policy) => <option key={policy.id}>{policy.name}</option>)}
            </select>
          </label>
          <label>Action
            <select value={filters.decision} onChange={setFilter('decision')}>
              <option value="">All</option>
              <option>warn</option>
              <option>block</option>
              <option>unchecked</option>
            </select>
          </label>
          <label>Status
            <select value={filters.status} onChange={setFilter('status')}>
              <option value="">All</option>
              <option>open</option>
              <option>reviewed</option>
            </select>
          </label>
          <label>From <input type="date" value={filters.date_from} onChange={setFilter('date_from')} /></label>
          <label>To <input type="date" value={filters.date_to} onChange={setFilter('date_to')} /></label>
          <button disabled={busy}>Apply filters</button>
        </form>
        {events.length === 0 ? <p>No events.</p> : (
          <table>
            <thead>
              <tr><th>Time</th><th>User</th><th>Type</th><th>Category</th><th>Score</th><th>Action</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatTime(event.created_at)}</td>
                  <td>{userName(event.user_id)}</td>
                  <td>{event.content_type}</td>
                  <td>{event.category || '-'}</td>
                  <td>{event.score === null ? '-' : event.score.toFixed(2)}</td>
                  <td>{event.decision}</td>
                  <td>{event.review_status}</td>
                  <td>
                    <button type="button" disabled={busy} onClick={() => run(() => api(`/admin/events/${event.id}`, {
                      method: 'PATCH', body: JSON.stringify({ status: toggle(event.review_status) }),
                    }))}>{event.review_status === 'open' ? 'Mark reviewed' : 'Reopen'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Reports</h3>
        {reports.length === 0 ? <p>No reports.</p> : (
          <table>
            <thead>
              <tr><th>Time</th><th>Reported by</th><th>Sender</th><th>Message</th><th>Reason</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{formatTime(report.created_at)}</td>
                  <td>{userName(report.reporter_id)}</td>
                  <td>{userName(report.message_user_id)}</td>
                  <td>{report.image_path ? '[image]' : report.message_text}</td>
                  <td>{report.reason}</td>
                  <td>{report.status}</td>
                  <td>
                    <button type="button" disabled={busy} onClick={() => run(() => api(`/admin/reports/${report.id}`, {
                      method: 'PATCH', body: JSON.stringify({ status: toggle(report.status) }),
                    }))}>{report.status === 'open' ? 'Mark reviewed' : 'Reopen'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Policies</h3>
        <p>Scores run from 0 to 1. Leave the block threshold empty to only warn.</p>
        <table>
          <thead>
            <tr><th>Category</th><th>Warn at</th><th>Block at</th><th /></tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <PolicyRow key={`${policy.id}-${policy.warn_threshold}-${policy.block_threshold}`} policy={policy} busy={busy}
                onSave={(id, values) => run(() => api(`/admin/policies/${id}`, { method: 'PATCH', body: JSON.stringify(values) }))} />
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>User risk</h3>
        <p>Counts of past moderation outcomes. A trend signal for admins, not a penalty.</p>
        <table>
          <thead>
            <tr><th>Name</th><th>Warnings</th><th>Blocks</th><th>Reports against</th></tr>
          </thead>
          <tbody>
            {risk.map((row) => (
              <tr key={row.user_id}><td>{row.name}</td><td>{row.warnings}</td><td>{row.blocks}</td><td>{row.reports}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Audit log</h3>
        {audit.length === 0 ? <p>No admin actions yet.</p> : (
          <table>
            <thead>
              <tr><th>Time</th><th>Admin</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatTime(entry.created_at)}</td><td>{userName(entry.admin_id)}</td>
                  <td>{entry.action}</td><td>{entry.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
