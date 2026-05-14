# Standard Python image use kar rahe hain jo VPS par smoothly chalegi
FROM python:3.11-slim

WORKDIR /app

# Audio processing ke liye zaroori libraries
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY ./bot.py .

CMD ["python", "bot.py"]
