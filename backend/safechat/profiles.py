import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, or_, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from accounts import FriendRequest, LoginSession, User, token_hash, verify_password
from database import get_session

router = APIRouter()


class ProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    bio: str


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=100)
    bio: str = Field(default='', max_length=300)

    @field_validator('name')
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError('Name cannot be blank.')
        return value.strip()


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class FriendRequestInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    recipient_id: int


class FriendRequestResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    status: str


def current_user(request: Request, session: Session = Depends(get_session)):
    token = request.cookies.get('safechat_session')
    record = session.get(LoginSession, token_hash(token)) if token else None
    expires = record.expires_at if record else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires is None or expires <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail='Please sign in.')
    user = session.get(User, record.user_id)
    if user is None or not user.email:
        raise HTTPException(status_code=401, detail='Please sign in.')
    return user


@router.post('/login', response_model=ProfileResponse)
def login(data: LoginRequest, request: Request, response: Response, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == data.email.strip().lower())).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Email or password is incorrect.')
    now = datetime.now(timezone.utc)
    session.exec(delete(LoginSession).where(LoginSession.expires_at <= now))
    previous = request.cookies.get('safechat_session')
    if previous:
        session.exec(delete(LoginSession).where(LoginSession.token_hash == token_hash(previous)))
    token = secrets.token_urlsafe(32)
    session.add(LoginSession(token_hash=token_hash(token), user_id=user.id, expires_at=now + timedelta(hours=8)))
    session.commit()
    response.set_cookie('safechat_session', token, httponly=True, samesite='strict',
                        secure=os.getenv('COOKIE_SECURE') == 'true', max_age=8 * 60 * 60)
    return user


@router.post('/logout', status_code=204)
def logout(request: Request, response: Response, session: Session = Depends(get_session)):
    token = request.cookies.get('safechat_session')
    if token:
        session.exec(delete(LoginSession).where(LoginSession.token_hash == token_hash(token)))
        session.commit()
    response.delete_cookie('safechat_session', httponly=True, samesite='strict')


@router.get('/me', response_model=ProfileResponse)
def get_profile(user: User = Depends(current_user)):
    return user


@router.patch('/me', response_model=ProfileResponse)
def update_profile(data: ProfileUpdate, user: User = Depends(current_user), session: Session = Depends(get_session)):
    user.name, user.bio = data.name, data.bio
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.get('/users', response_model=list[ProfileResponse])
def get_users(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(select(User).where(User.email.is_not(None)).order_by(User.id)).all()


@router.post('/friend-requests', response_model=FriendRequestResponse, status_code=201)
def send_request(data: FriendRequestInput, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if data.recipient_id == user.id:
        raise HTTPException(status_code=400, detail='You cannot add yourself.')
    recipient = session.get(User, data.recipient_id)
    if recipient is None or not recipient.email:
        raise HTTPException(status_code=404, detail='User not found.')
    record = FriendRequest(sender_id=user.id, recipient_id=recipient.id)
    session.add(record)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail='A request or friendship already exists.')
    session.refresh(record)
    return record


@router.get('/friend-requests', response_model=list[FriendRequestResponse])
def get_requests(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(select(FriendRequest).where(
        or_(FriendRequest.sender_id == user.id, FriendRequest.recipient_id == user.id),
        FriendRequest.status == 'pending',
    ).order_by(FriendRequest.id)).all()


def recipient_request(request_id, user, session):
    record = session.get(FriendRequest, request_id)
    if record is None:
        raise HTTPException(status_code=404, detail='Request not found.')
    if record.recipient_id != user.id:
        raise HTTPException(status_code=403, detail='Only the recipient can respond.')
    if record.status != 'pending':
        raise HTTPException(status_code=409, detail='Request is already accepted.')


@router.post('/friend-requests/{request_id}/accept', response_model=FriendRequestResponse)
def accept_request(request_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    recipient_request(request_id, user, session)
    result = session.exec(update(FriendRequest).where(
        FriendRequest.id == request_id, FriendRequest.status == 'pending',
    ).values(status='accepted'))
    if not result.rowcount:
        raise HTTPException(status_code=409, detail='Request has changed. Refresh and try again.')
    session.commit()
    return session.get(FriendRequest, request_id)


@router.delete('/friend-requests/{request_id}', status_code=204)
def decline_request(request_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    recipient_request(request_id, user, session)
    result = session.exec(delete(FriendRequest).where(
        FriendRequest.id == request_id, FriendRequest.status == 'pending',
    ))
    if not result.rowcount:
        raise HTTPException(status_code=409, detail='Request has changed. Refresh and try again.')
    session.commit()


@router.get('/friends', response_model=list[ProfileResponse])
def get_friends(user: User = Depends(current_user), session: Session = Depends(get_session)):
    records = session.exec(select(FriendRequest).where(
        or_(FriendRequest.sender_id == user.id, FriendRequest.recipient_id == user.id),
        FriendRequest.status == 'accepted',
    )).all()
    ids = [record.recipient_id if record.sender_id == user.id else record.sender_id for record in records]
    return session.exec(select(User).where(User.id.in_(ids)).order_by(User.id)).all() if ids else []
