import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tablet_id: Mapped[str] = mapped_column(String(36), ForeignKey("tablets.id"), nullable=False)
    teacher_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("teachers.id"), nullable=True)
    # Denormalized so history survives teacher deletion
    teacher_name: Mapped[str] = mapped_column(String(200), nullable=False)
    discipline: Mapped[str] = mapped_column(String(300), nullable=False)
    # Per-session HMAC secret for frontend QR generation
    qr_secret: Mapped[str] = mapped_column(String(64), nullable=False)
    rotate_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ended_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # JSON snapshot of the RUZ lesson (subject, groups, time) at session start
    schedule_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    tablet: Mapped["Tablet"] = relationship("Tablet", back_populates="sessions")
    teacher: Mapped["Teacher | None"] = relationship("Teacher", back_populates="sessions")
    attendances: Mapped[list["Attendance"]] = relationship("Attendance", back_populates="session", cascade="all, delete-orphan")
