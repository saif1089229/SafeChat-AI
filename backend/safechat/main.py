from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class TextMessage(BaseModel):
    text: str


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post('/classify')
async def classify(message: TextMessage):
    return {'decision': 'allow'}
