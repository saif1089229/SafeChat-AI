from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, Session, SQLModel, select

from accounts import FriendRequest, User
from database import get_session
from profiles import ProfileResponse, current_user

router = APIRouter()


class Channel(SQLModel, table=True):
    __tablename__ = 'Channels'

    id: int | None = Field(default=None, primary_key=True)
    name: str


class DirectChat(SQLModel, table=True):
    __tablename__ = 'DirectChats'

    channel_id: int = Field(primary_key=True)
    user_one_id: int
    user_two_id: int


class Block(SQLModel, table=True):
    __tablename__ = 'Blocks'

    blocker_id: int = Field(primary_key=True)
    blocked_id: int = Field(primary_key=True)


class UserInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    user_id: int


class ChannelResponse(BaseModel):
    id: int
    name: str
    direct_user_id: int | None = None


def other_user_id(chat, user_id):
    return chat.user_two_id if chat.user_one_id == user_id else chat.user_one_id


def is_blocked(user_id, other_id, session):
    return session.exec(select(Block).where(or_(
        and_(Block.blocker_id == user_id, Block.blocked_id == other_id),
        and_(Block.blocker_id == other_id, Block.blocked_id == user_id),
    ))).first() is not None


def check_channel(channel_id, user, session, sending=False):
    """Stop users from reading or sending in a direct chat that is not theirs."""
    if session.get(Channel, channel_id) is None:
        raise HTTPException(status_code=404, detail='Channel not found.')
    chat = session.get(DirectChat, channel_id)
    if chat is None:
        return
    if user.id not in (chat.user_one_id, chat.user_two_id):
        raise HTTPException(status_code=404, detail='Channel not found.')
    if sending and is_blocked(user.id, other_user_id(chat, user.id), session):
        raise HTTPException(status_code=403, detail='You cannot message this person.')


def direct_channel(chat, user_id, session):
    other = session.get(User, other_user_id(chat, user_id))
    return ChannelResponse(id=chat.channel_id, name=other.name, direct_user_id=other.id)


@router.get('/channels', response_model=list[ChannelResponse])
def get_channels(user: User = Depends(current_user), session: Session = Depends(get_session)):
    public = session.exec(select(Channel).where(
        Channel.id.not_in(select(DirectChat.channel_id)),
    ).order_by(Channel.id)).all()
    chats = session.exec(select(DirectChat).where(
        or_(DirectChat.user_one_id == user.id, DirectChat.user_two_id == user.id),
    ).order_by(DirectChat.channel_id)).all()
    return [ChannelResponse(id=channel.id, name=channel.name) for channel in public] + [
        direct_channel(chat, user.id, session) for chat in chats
    ]


@router.post('/direct-messages', response_model=ChannelResponse)
def open_direct_chat(data: UserInput, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if data.user_id == user.id:
        raise HTTPException(status_code=400, detail='You cannot message yourself.')
    one, two = sorted((user.id, data.user_id))
    friendship = session.exec(select(FriendRequest).where(
        or_(and_(FriendRequest.sender_id == one, FriendRequest.recipient_id == two),
            and_(FriendRequest.sender_id == two, FriendRequest.recipient_id == one)),
        FriendRequest.status == 'accepted',
    )).first()
    if friendship is None:
        raise HTTPException(status_code=403, detail='You can only message your friends.')
    if is_blocked(user.id, data.user_id, session):
        raise HTTPException(status_code=403, detail='You cannot message this person.')

    chat = session.exec(select(DirectChat).where(
        DirectChat.user_one_id == one, DirectChat.user_two_id == two,
    )).first()
    if chat is None:
        channel = Channel(name='direct')
        session.add(channel)
        session.flush()
        chat = DirectChat(channel_id=channel.id, user_one_id=one, user_two_id=two)
        session.add(chat)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            raise HTTPException(status_code=409, detail='Chat already exists. Refresh and try again.')
    return direct_channel(chat, user.id, session)


@router.get('/blocks', response_model=list[ProfileResponse])
def get_blocks(user: User = Depends(current_user), session: Session = Depends(get_session)):
    return session.exec(select(User).join(Block, Block.blocked_id == User.id).where(
        Block.blocker_id == user.id,
    ).order_by(User.id)).all()


@router.post('/blocks', status_code=201)
def block_user(data: UserInput, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if data.user_id == user.id:
        raise HTTPException(status_code=400, detail='You cannot block yourself.')
    blocked = session.get(User, data.user_id)
    if blocked is None or not blocked.email:
        raise HTTPException(status_code=404, detail='User not found.')
    session.add(Block(blocker_id=user.id, blocked_id=blocked.id))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail='You already blocked this person.')
    return {'blocked_id': blocked.id}


@router.delete('/blocks/{user_id}', status_code=204)
def unblock_user(user_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    block = session.get(Block, (user.id, user_id))
    if block is None:
        raise HTTPException(status_code=404, detail='This person is not blocked.')
    session.delete(block)
    session.commit()
