from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select
from sqlmodel import Field as SQLField

from accounts import User
from database import engine, get_session
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


class MessageResponse(MessageRequest):
    id: int
    user_id: int


class Message(SQLModel, table=True):
    __tablename__ = 'Messages'

    id: int | None = SQLField(default=None, primary_key=True)
    user_id: int
    channel_id: int
    text: str


class TextMessage(BaseModel):
    text: str


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post('/classify')
async def classify(message: TextMessage):
    return {'decision': 'allow'}


@app.post('/messages', response_model=MessageResponse, status_code=201)
def create_message(message: MessageRequest, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if not message.text.strip():
        raise HTTPException(status_code=422, detail='Message cannot be blank.')
    saved_message = Message(**message.model_dump(), user_id=user.id)
    session.add(saved_message)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=400, detail='User or channel does not exist.')
    session.refresh(saved_message)
    return saved_message


@app.get('/messages', response_model=list[MessageResponse])
def get_messages(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(select(Message).order_by(Message.id)).all()
