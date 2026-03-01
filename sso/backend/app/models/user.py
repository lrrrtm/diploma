import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Which mini-app this user belongs to: 'sso' | 'services' | 'traffic'
    app: Mapped[str] = mapped_column(String(50), nullable=False)

    # Role within that app: 'admin' | 'staff' | 'executor' | 'teacher'
    role: Mapped[str] = mapped_column(String(50), nullable=False)

    # Links to the app-specific entity (department_id, executor_id, teacher_id).
    # Null for app-level admins and sso admin.
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    telegram_link: Mapped["TelegramLink | None"] = relationship(
        "TelegramLink",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
