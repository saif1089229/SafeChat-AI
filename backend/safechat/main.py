from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, DateTime
from sqlmodel import Session, SQLModel, select
from sqlmodel import Field as SQLField

from accounts import User
from database import get_session
from direct_messages import check_channel
from direct_messages import router as direct_messages_router
from moderation import ModerationEvent, Policy, check_text, rewrite
from profiles import current_user, router

ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PATCH', 'DELETE'],
    allow_headers=['Content-Type'],
)

app.include_router(router)
app.include_router(direct_messages_router)


@app.middleware('http')
async def check_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    if request.method in ('POST', 'PATCH', 'DELETE') and origin and origin not in ORIGINS:
        return JSONResponse(status_code=403, content={'detail': 'Origin is not allowed.'})
    return await call_next(request)


class MessageRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    channel_id: int
    text: str = Field(min_length=1)
    confirm: bool = False


class MessageResponse(BaseModel):
    id: int
    user_id: int
    channel_id: int
    text: str
    created_at: datetime


class Message(SQLModel, table=True):
    __tablename__ = 'Messages'

    id: int | None = SQLField(default=None, primary_key=True)
    user_id: int
    channel_id: int
    text: str
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc),
                                    sa_column=Column(DateTime(timezone=True), nullable=False))


class TextMessage(BaseModel):
    text: str = Field(min_length=1)


class ClassifyResponse(BaseModel):
    decision: str
    category: str | None
    score: float | None


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post('/classify', response_model=ClassifyResponse)
def classify(message: TextMessage, user: User = Depends(current_user), session: Session = Depends(get_session)):
    decision, category, score = check_text(message.text, session.exec(select(Policy)).all())
    return ClassifyResponse(decision=decision, category=category, score=score)


@app.post('/rewrite', response_model=TextMessage)
def safe_rewrite(message: TextMessage, user: User = Depends(current_user)):
    try:
        return TextMessage(text=rewrite(message.text))
    except (KeyError, httpx.HTTPError):
        raise HTTPException(status_code=503, detail='Safe Rewrite is not available right now.')


@app.post('/messages', response_model=MessageResponse, status_code=201)
def create_message(message: MessageRequest, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if not message.text.strip():
        raise HTTPException(status_code=422, detail='Message cannot be blank.')
    check_channel(message.channel_id, user, session, sending=True)

    decision, category, score = check_text(message.text, session.exec(select(Policy)).all())
    event = ModerationEvent(user_id=user.id, channel_id=message.channel_id, decision=decision,
                            content_type='link' if category == 'unsafe link' else 'text',
                            category=category, score=score)
    if decision == 'block':
        session.add(event)
        session.commit()
        raise HTTPException(status_code=422, detail=f'This message was blocked for {category}. Please change it.')
    if decision == 'warn' and not message.confirm:
        raise HTTPException(status_code=409, detail=f'This message was flagged for {category}. '
                                                    'Edit it, use Safe Rewrite, or send it anyway.')

    saved_message = Message(channel_id=message.channel_id, text=message.text, user_id=user.id)
    session.add(saved_message)
    session.flush()
    if decision != 'allow':
        event.message_id = saved_message.id
        session.add(event)
    session.commit()
    session.refresh(saved_message)
    return saved_message


@app.get('/messages', response_model=list[MessageResponse])
def get_messages(channel_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    check_channel(channel_id, user, session)
    return session.exec(select(Message).where(Message.channel_id == channel_id).order_by(Message.id)).all()
