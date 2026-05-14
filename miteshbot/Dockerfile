FROM dailyco/pipecat-base:latest

WORKDIR /app

COPY ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY ./bot.py .
COPY ./.env .

# Set environment variables from .env during runtime
ENV PYTHONUNBUFFERED=1

CMD ["python", "bot.py"]