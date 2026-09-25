FROM python:3.12-slim
RUN pip install --no-cache-dir osipy==0.1.4 \
    && useradd --create-home --home-dir /home/osipy --shell /usr/sbin/nologin osipy
WORKDIR /app
COPY companion /app/companion
USER osipy
EXPOSE 60016
CMD ["python", "companion/server.py", "--bind", "0.0.0.0"]
