from sqlalchemy import Column, String, Text, ForeignKey, DateTime, JSON, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
import uuid

from app.database import Base


class ApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"


class Application(Base):
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    service_id = Column(String(36), ForeignKey("services.id"), nullable=False)
    student_external_id = Column(String(255), nullable=False, index=True)
    student_name = Column(String(255), nullable=False)
    student_email = Column(String(255), nullable=True)
    form_data = Column(JSON, nullable=False, default=dict)
    status = Column(Enum(ApplicationStatus), default=ApplicationStatus.PENDING)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    executor_id = Column(String(36), ForeignKey("executors.id"), nullable=True)

    service = relationship("Service", back_populates="applications")
    executor = relationship("Executor", back_populates="assigned_applications")
    attachments = relationship("Attachment", back_populates="application", cascade="all, delete-orphan")
    responses = relationship("ApplicationResponse", back_populates="application", cascade="all, delete-orphan")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False)
    response_id = Column(String(36), ForeignKey("application_responses.id"), nullable=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    application = relationship("Application", back_populates="attachments")
    response = relationship("ApplicationResponse", back_populates="attachments")


class ApplicationResponse(Base):
    __tablename__ = "application_responses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False)
    department_id = Column(String(36), ForeignKey("departments.id"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    application = relationship("Application", back_populates="responses")
    department = relationship("Department")
    attachments = relationship("Attachment", back_populates="response", cascade="all, delete-orphan")
