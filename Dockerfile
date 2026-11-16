FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY scripts ./scripts
COPY web ./web
RUN npm run build
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 DATA_DIR=/data
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py manage.py ./
COPY --from=frontend /build/dist ./dist
EXPOSE 8765
CMD ["gunicorn", "--bind", "0.0.0.0:8765", "--workers", "1", "--threads", "4", "--timeout", "180", "--access-logfile", "-", "server:app"]
