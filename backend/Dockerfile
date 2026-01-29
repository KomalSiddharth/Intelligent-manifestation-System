# FROM python:3.11-slim

# # Install system dependencies
# RUN apt-get update && apt-get install -y \
#     ffmpeg \
#     build-essential \
#     && rm -rf /var/lib/apt/lists/*

# # Set working directory
# WORKDIR /app

# # Copy requirements
# COPY backend/requirements.txt .

# # Install dependencies
# RUN pip install --no-cache-dir -r requirements.txt

# # Copy everything
# COPY . .

# # Expose port
# EXPOSE 5000

# # Start command
# CMD ["python", "backend/app.py"]

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# 1. FIX: Folder prefix hata dein kyunki hum pehle se backend folder mein hain
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 2. FIX: Copy everything (Local backend folder ki saari files /app mein chali jayengi)
COPY . .

# Expose port
EXPOSE 5000

# 3. FIX: Path ko theek karein (Ab app.py root par hi mil jayegi)
CMD ["python", "app.py"]