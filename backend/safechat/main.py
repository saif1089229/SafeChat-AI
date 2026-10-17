import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel import Field as SQLField

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)

engine = create_engine(os.getenv(
    'DATABASE_URL',
    'postgresql+psycopg://postgres@127.0.0.1:5433/safechat_ai',
))


def get_session():
    with Session(engine) as session:
        yield session


class MessageRequest(BaseModel):
    user_id: int
    channel_id: int
    text: str = Field(min_length=1)


class MessageResponse(MessageRequest):
    id: int


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
def create_message(message: MessageRequest, session: Session = Depends(get_session)):
    if not message.text.strip():
        raise HTTPException(status_code=422, detail='Message cannot be blank.')
    saved_message = Message(**message.model_dump())
    session.add(saved_message)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=400, detail='User or channel does not exist.')
    session.refresh(saved_message)
    return saved_message


@app.get('/messages', response_model=list[MessageResponse])
def get_messages(session: Session = Depends(get_session)):
    return session.exec(select(Message).order_by(Message.id)).all()
