FROM python:3.12-slim

WORKDIR /app

COPY services/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/python /app/shared/python
COPY services/backend /app

ENV PYTHONPATH="/app:/app/shared/python"

RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
