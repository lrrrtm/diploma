import uuid

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tablet(Base):
    __tablename__ = "tablets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 6-digit PIN shown on unregistered kiosk screen — admin enters to identify tablet
    reg_pin: Mapped[str] = mapped_column(String(6), nullable=False, unique=True, index=True)
    # 6-digit PIN shown on registered/waiting kiosk screen — teacher enters to start session
    # Also used by kiosk display to authenticate when fetching qr_secret
    display_pin: Mapped[str] = mapped_column(String(6), nullable=False, unique=True, index=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Set by admin after entering registration PIN
    building_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    building_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    room_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    room_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="tablet", cascade="all, delete-orphan")

    @property
    def is_registered(self) -> bool:
        return self.room_id is not None
