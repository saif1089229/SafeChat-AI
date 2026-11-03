import hashlib
import hmac
import secrets
from datetime import datetime

from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = 'Users'

    id: int = Field(primary_key=True)
    name: str
    email: str | None = None
    bio: str = ''
    password_hash: str | None = None


class LoginSession(SQLModel, table=True):
    __tablename__ = 'Sessions'

    token_hash: str = Field(primary_key=True)
    user_id: int
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class FriendRequest(SQLModel, table=True):
    __tablename__ = 'FriendRequests'

    id: int | None = Field(default=None, primary_key=True)
    sender_id: int
    recipient_id: int
    status: str = 'pending'


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000)
    return f'pbkdf2_sha256$600000${salt}${digest.hex()}'


def verify_password(password, stored):
    if not stored:
        return False
    try:
        algorithm, rounds, salt, expected = stored.split('$')
        if algorithm != 'pbkdf2_sha256':
            return False
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()
