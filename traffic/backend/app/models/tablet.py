import uuid

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tablet(Base):
    __tablename__ = "tablets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    init_secret: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Set by admin after scanning registration QR
    building_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    building_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    room_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    room_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="tablet")

    @property
    def is_registered(self) -> bool:
        return self.room_id is not None
