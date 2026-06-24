FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY whep_relay.py .

ENV WHEP_RELAY_HOST=0.0.0.0
ENV WHEP_RELAY_PORT=8889

EXPOSE 8889
CMD ["python", "whep_relay.py"]
