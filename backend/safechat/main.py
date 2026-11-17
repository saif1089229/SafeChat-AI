import os
import secrets
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from accounts import Message, User
from admin import Report
from admin import router as admin_router
from database import get_session
from direct_messages import check_channel
from direct_messages import router as direct_messages_router
from moderation import ModerationEvent, Policy, check_image, check_text, rewrite
from profiles import current_user, router

ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
UPLOAD_DIR = Path(os.getenv('UPLOAD_DIR', Path(__file__).parent / 'uploads'))
IMAGE_TYPES = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp'}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
NOTICES = {
    'message': ('This message was blocked for {}. Please change it.',
                'This message was flagged for {}. Edit it, use Safe Rewrite, or send it anyway.'),
    'image': ('This image was blocked for {}. Please choose another image.',
              'This image was flagged for {}. Choose another image or send it anyway.'),
}

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
app.include_router(admin_router)


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
    image_path: str | None
    created_at: datetime


class TextMessage(BaseModel):
    text: str = Field(min_length=1)


class ClassifyResponse(BaseModel):
    decision: str
    category: str | None
    score: float | None


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message_id: int
    reason: str = Field(min_length=1, max_length=300)

    @field_validator('reason')
    @classmethod
    def valid_reason(cls, value):
        if not value.strip():
            raise ValueError('Reason cannot be blank.')
        return value.strip()


def apply_decision(result, kind, confirm, user, channel_id, session):
    """Stop blocked content and unconfirmed warnings. Return the event to log, if any."""
    decision, category, score = result
    content_type = 'link' if category == 'unsafe link' else 'image' if kind == 'image' else 'text'
    event = ModerationEvent(user_id=user.id, channel_id=channel_id, decision=decision,
                            content_type=content_type, category=category, score=score)
    blocked_notice, warning_notice = NOTICES[kind]
    if decision == 'block':
        session.add(event)
        session.commit()
        raise HTTPException(status_code=422, detail=blocked_notice.format(category))
    if decision == 'warn' and not confirm:
        raise HTTPException(status_code=409, detail=warning_notice.format(category))
    return None if decision == 'allow' else event


def save_message(message, event, session):
    session.add(message)
    session.flush()
    if event is not None:
        event.message_id = message.id
        session.add(event)
    session.commit()
    session.refresh(message)
    return message


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

    result = check_text(message.text, session.exec(select(Policy)).all())
    event = apply_decision(result, 'message', message.confirm, user, message.channel_id, session)
    return save_message(Message(channel_id=message.channel_id, text=message.text, user_id=user.id), event, session)


@app.post('/messages/image', response_model=MessageResponse, status_code=201)
def send_image(channel_id: int = Form(), image: UploadFile = File(), confirm: bool = Form(False),
               user: User = Depends(current_user), session: Session = Depends(get_session)):
    check_channel(channel_id, user, session, sending=True)
    if image.content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=422, detail='Choose a PNG, JPEG, GIF or WebP image.')
    data = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail='Images must be 5 MB or smaller.')

    result = check_image(data, image.content_type, session.exec(select(Policy)).all())
    event = apply_decision(result, 'image', confirm, user, channel_id, session)
    name = secrets.token_hex(16) + IMAGE_TYPES[image.content_type]
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / name).write_bytes(data)
    return save_message(Message(channel_id=channel_id, text='', image_path=name, user_id=user.id), event, session)


@app.get('/messages', response_model=list[MessageResponse])
def get_messages(channel_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    check_channel(channel_id, user, session)
    return session.exec(select(Message).where(Message.channel_id == channel_id).order_by(Message.id)).all()


@app.get('/images/{name}')
def get_image(name: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    message = session.exec(select(Message).where(Message.image_path == name)).first()
    if message is None:
        raise HTTPException(status_code=404, detail='Image not found.')
    check_channel(message.channel_id, user, session)
    return FileResponse(UPLOAD_DIR / name)


@app.post('/reports', status_code=201)
def report_message(data: ReportRequest, user: User = Depends(current_user), session: Session = Depends(get_session)):
    message = session.get(Message, data.message_id)
    if message is None:
        raise HTTPException(status_code=404, detail='Message not found.')
    check_channel(message.channel_id, user, session)
    if message.user_id == user.id:
        raise HTTPException(status_code=400, detail='You cannot report your own message.')
    report = Report(reporter_id=user.id, message_id=message.id, reason=data.reason)
    session.add(report)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail='You already reported this message.')
    return {'id': report.id, 'status': report.status}
