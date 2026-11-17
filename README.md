# SafeChat AI

A university chat app that checks messages, links and images before they are shared. Risky content gets a short warning with a suggested polite rewrite, severe content is blocked, and an admin dashboard shows what was flagged and lets admins adjust the rules.

Capstone B, Group 14. Supervisor: Dr. Zakaria Khiati.

## Features

- Sign in with a group member account, edit your profile, send and accept friend requests.
- A general channel and private direct messages between friends. Either person can block the other.
- Every message is checked by the OpenAI Moderation API. Links are checked with Google Safe Browsing. Images are checked by the OpenAI Moderation API before they are saved.
- Each category has a warn threshold and a block threshold. A warned message can be edited, rewritten with Safe Rewrite (OpenAI) or sent anyway. A blocked message is never saved.
- Students can report a message. Admins see flagged events with filters, reports, per-user counts, and an audit log of admin actions, and can change the thresholds.
- If a checking service is unavailable, the message is allowed and logged as `unchecked` so it can be reviewed later.

## Team

| Member | Part | Main files |
|---|---|---|
| Rashed Salem Alhantoobi | PostgreSQL database, Docker setup | `database/`, `docker-compose.yml` |
| Sultan Yousif Alzaabi | FastAPI backend | `backend/safechat/` |
| Saif Khaled Alshehhi | React frontend | `frontend/safechat/` |

## Run with Docker

1. Copy `.env.example` to `.env` and fill in the values.
2. Start everything:

   ```
   docker compose up --build
   ```

3. The first time, set the three member passwords (the prompt hides what you type):

   ```
   docker compose exec backend python set_member_passwords.py
   ```

4. Open http://127.0.0.1:5173. The API documentation is at http://127.0.0.1:8014/docs.

The database and uploaded images are kept in Docker volumes. `docker compose down -v` deletes them.

## Run without Docker

You need PostgreSQL, Python 3.10 or newer and Node.js 22.

1. Create a database called `safechat_ai` and run the files in `database/` in this order: `schema.sql`, `seed.sql`, `profiles_friends.sql`, `direct_messages_moderation.sql`, `images_reports_admin.sql`.
2. Backend:

   ```
   cd backend
   python -m venv .venv
   .venv/Scripts/pip install -r safechat/requirements.txt
   cd ..
   set DATABASE_URL, OPENAI_API_KEY, SAFE_BROWSING_API_KEY and OPENAI_REWRITE_MODEL in your terminal
   backend/.venv/Scripts/python -m uvicorn main:app --app-dir backend/safechat --host 127.0.0.1 --port 8014
   ```

   On a new database, set the passwords once from `backend/safechat` with `python set_member_passwords.py`.

3. Frontend, in a second terminal, with `VITE_API_URL` set to `http://127.0.0.1:8014`:

   ```
   cd frontend/safechat
   npm install
   npm run dev -- --host 127.0.0.1 --port 5173
   ```

Use `127.0.0.1` for both addresses so the sign-in cookie works.

## Configuration

| Variable | Used for |
|---|---|
| `DATABASE_URL` | PostgreSQL connection, for example `postgresql+psycopg://postgres@127.0.0.1:5433/safechat_ai` |
| `OPENAI_API_KEY` | Text and image moderation, and Safe Rewrite |
| `SAFE_BROWSING_API_KEY` | Google Safe Browsing link checks |
| `OPENAI_REWRITE_MODEL` | Model for Safe Rewrite. Defaults to `gpt-4o-mini` |
| `UPLOAD_DIR` | Where images are stored. Defaults to `backend/safechat/uploads` |
| `VITE_API_URL` | Backend address used by the frontend |

## Limits

- Only the three group member accounts exist. There is no public sign-up and no university single sign-on.
- The setup is for local use. It does not include HTTPS or a public deployment.
- Saif's account is the admin.
