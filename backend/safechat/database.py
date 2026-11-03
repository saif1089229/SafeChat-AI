import os

from sqlmodel import Session, create_engine

engine = create_engine(os.getenv(
    'DATABASE_URL',
    'postgresql+psycopg://postgres@127.0.0.1:5433/safechat_ai',
))


def get_session():
    with Session(engine) as session:
        yield session
