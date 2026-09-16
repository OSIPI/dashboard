FROM python:3.12-slim

# Non-root runtime user; owns only the application directory.
RUN useradd --create-home --home-dir /home/osipy --shell /usr/sbin/nologin osipy \
    && mkdir /app \
    && chown osipy:osipy /app

WORKDIR /app

# Install dependencies as root (system site-packages), then drop privileges.
# Copy packaging + source only so this layer caches across code changes.
COPY --chown=osipy:osipy pyproject.toml uv.lock README.md ./
COPY --chown=osipy:osipy src ./src
RUN pip install --no-cache-dir .

USER osipy

EXPOSE 8000

# 0.0.0.0 so the port is reachable from outside the container.
CMD ["uvicorn", "osipy_rest_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
