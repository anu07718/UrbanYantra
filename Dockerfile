# UrbanYantra FastAPI — Hugging Face Space (Docker SDK, port 7860)
# Build: docker build -t urbanyantra-api .
# HF Space: connect this GitHub repo; HF uses this Dockerfile automatically.

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin libgdal-dev libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860

COPY requirements-deploy.txt .
RUN pip install --no-cache-dir -r requirements-deploy.txt

COPY backend/ backend/
COPY configs/ configs/
COPY geography/ geography/
COPY features/ features/
COPY simulation/ simulation/
COPY data/benchmarks/ data/benchmarks/
COPY scripts/sync_outputs_from_hf.py scripts/sync_outputs_from_hf.py
COPY scripts/upload_outputs_to_hf.py scripts/upload_outputs_to_hf.py
COPY utils.py utils.py
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && python -c "from backend.app.main import app; print('import ok')"

EXPOSE 7860
ENTRYPOINT ["/entrypoint.sh"]
