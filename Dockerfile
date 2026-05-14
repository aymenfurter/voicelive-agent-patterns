# Stage 1: Build frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

# Install dependencies for both services
COPY backend/requirements.txt ./backend/requirements.txt
COPY question-service/requirements.txt ./question-service/requirements.txt
RUN pip install --no-cache-dir \
    -r backend/requirements.txt \
    -r question-service/requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY question-service/ ./question-service/
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000 8001

ENTRYPOINT ["./start.sh"]
