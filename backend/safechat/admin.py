from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Column, DateTime
from sqlmodel import Session, SQLModel, select
from sqlmodel import Field as SQLField

from accounts import Message, User
from database import get_session
from moderation import ModerationEvent, Policy
from profiles import current_user

router = APIRouter(prefix='/admin')


def now():
    return datetime.now(timezone.utc)


class Report(SQLModel, table=True):
    __tablename__ = 'Reports'

    id: int | None = SQLField(default=None, primary_key=True)
    reporter_id: int
    message_id: int
    reason: str
    status: str = 'open'
    created_at: datetime = SQLField(default_factory=now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AuditEntry(SQLModel, table=True):
    __tablename__ = 'AuditLog'

    id: int | None = SQLField(default=None, primary_key=True)
    admin_id: int
    action: str
    details: str
    created_at: datetime = SQLField(default_factory=now, sa_column=Column(DateTime(timezone=True), nullable=False))


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['open', 'reviewed']


class PolicyUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    warn_threshold: float = Field(ge=0, le=1)
    block_threshold: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode='after')
    def block_after_warn(self):
        if self.block_threshold is not None and self.block_threshold < self.warn_threshold:
            raise ValueError('Block threshold must be at least the warn threshold.')
        return self


class ReportView(BaseModel):
    id: int
    reporter_id: int
    message_id: int
    message_user_id: int
    message_text: str
    image_path: str | None
    reason: str
    status: str
    created_at: datetime


class RiskView(BaseModel):
    user_id: int
    name: str
    warnings: int
    blocks: int
    reports: int


def require_admin(user: User = Depends(current_user)):
    if user.role != 'admin':
        raise HTTPException(status_code=403, detail='Admins only.')
    return user


def record(session, admin, action, details):
    session.add(AuditEntry(admin_id=admin.id, action=action, details=details))


@router.get('/events', response_model=list[ModerationEvent])
def get_events(category: str | None = None, decision: str | None = None, status: str | None = None,
               date_from: date | None = None, date_to: date | None = None,
               admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    query = select(ModerationEvent)
    if category:
        query = query.where(ModerationEvent.category == category)
    if decision:
        query = query.where(ModerationEvent.decision == decision)
    if status:
        query = query.where(ModerationEvent.review_status == status)
    if date_from:
        query = query.where(ModerationEvent.created_at >= datetime.combine(date_from, time(), timezone.utc))
    if date_to:
        query = query.where(ModerationEvent.created_at < datetime.combine(date_to + timedelta(days=1), time(), timezone.utc))
    return session.exec(query.order_by(ModerationEvent.id.desc())).all()


@router.patch('/events/{event_id}', response_model=ModerationEvent)
def review_event(event_id: int, data: StatusUpdate, admin: User = Depends(require_admin),
                 session: Session = Depends(get_session)):
    event = session.get(ModerationEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail='Event not found.')
    event.review_status = data.status
    record(session, admin, 'review event', f'Event {event.id} marked {data.status}')
    session.commit()
    session.refresh(event)
    return event


@router.get('/reports', response_model=list[ReportView])
def get_reports(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    rows = session.exec(select(Report, Message).join(Message, Message.id == Report.message_id)
                        .order_by(Report.id.desc())).all()
    return [ReportView(**report.model_dump(), message_user_id=message.user_id, message_text=message.text,
                       image_path=message.image_path) for report, message in rows]


@router.patch('/reports/{report_id}')
def review_report(report_id: int, data: StatusUpdate, admin: User = Depends(require_admin),
                  session: Session = Depends(get_session)):
    report = session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail='Report not found.')
    report.status = data.status
    record(session, admin, 'review report', f'Report {report.id} marked {data.status}')
    session.commit()
    return {'id': report.id, 'status': report.status}


@router.get('/policies', response_model=list[Policy])
def get_policies(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    return session.exec(select(Policy).order_by(Policy.id)).all()


@router.patch('/policies/{policy_id}', response_model=Policy)
def update_policy(policy_id: int, data: PolicyUpdate, admin: User = Depends(require_admin),
                  session: Session = Depends(get_session)):
    policy = session.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail='Policy not found.')
    policy.warn_threshold, policy.block_threshold = data.warn_threshold, data.block_threshold
    block = 'off' if data.block_threshold is None else data.block_threshold
    record(session, admin, 'change policy', f'{policy.name}: warn {data.warn_threshold}, block {block}')
    session.commit()
    session.refresh(policy)
    return policy


@router.get('/risk', response_model=list[RiskView])
def get_risk(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    decisions = Counter(tuple(row) for row in session.exec(select(ModerationEvent.user_id, ModerationEvent.decision)))
    reports = Counter(session.exec(select(Message.user_id).join(Report, Report.message_id == Message.id)).all())
    users = session.exec(select(User).where(User.email.is_not(None)).order_by(User.id)).all()
    return [RiskView(user_id=user.id, name=user.name, warnings=decisions[(user.id, 'warn')],
                     blocks=decisions[(user.id, 'block')], reports=reports[user.id]) for user in users]


@router.get('/audit', response_model=list[AuditEntry])
def get_audit(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    return session.exec(select(AuditEntry).order_by(AuditEntry.id.desc())).all()
