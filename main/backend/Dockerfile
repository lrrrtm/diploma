FROM python:3.12-slim
WORKDIR /app
COPY main/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY main/backend /app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
