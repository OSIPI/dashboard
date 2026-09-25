FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production OSIPY_LOCAL_COMPANION_PROXY=1
ARG APP_SHA=local
ENV APP_SHA=${APP_SHA}
RUN bun scripts/assert_sample_free.ts static \
    && bun run build \
    && bun scripts/assert_sample_free.ts build

FROM python:3.12-slim
RUN pip install --no-cache-dir osipy==0.1.4 \
    && useradd --create-home --home-dir /home/osipy --shell /usr/sbin/nologin osipy
WORKDIR /app
COPY --from=builder /app/build /app/build
COPY companion /app/companion
COPY docker /app/docker
USER osipy
EXPOSE 37183
CMD ["python", "docker/start.py"]
