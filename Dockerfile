FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ARG APP_MODULE=user_app:app
ARG APP_PORT=8000
ENV APP_MODULE=${APP_MODULE}
ENV APP_PORT=${APP_PORT}

EXPOSE ${APP_PORT}

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${APP_PORT} ${APP_MODULE}"]
