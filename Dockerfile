FROM python:3.12-slim
WORKDIR /app
COPY rest-api/pyproject.toml rest-api/README.md /app/rest-api/
COPY rest-api/src /app/rest-api/src
COPY docker/api-entrypoint.sh /app/api-entrypoint.sh
RUN pip install --no-cache-dir --no-compile osipy==0.1.4 /app/rest-api \
    && useradd --create-home --home-dir /home/osipy --shell /usr/sbin/nologin osipy
USER osipy
EXPOSE 60016
CMD ["sh", "/app/api-entrypoint.sh"]
