# Build Stage
FROM node:20-slim as build
WORKDIR /app

# Install build dependencies if needed (slim needs these for some native modules)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Set environment variables for the build
ENV VITE_SUPABASE_URL=https://axfxldgynmlwdsidklun.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZnhsZGd5bm1sd2RzaWRrbHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0Njc5MjMsImV4cCI6MjA4MjA0MzkyM30.niXl1b-LTaSr1o1vraImxa-hOa7OeVK4Czi8vR_CV64
ENV VITE_API_URL=http://76.13.58.123:5000
ENV NODE_OPTIONS="--max-old-space-size=3072"
ENV CI=false
ENV VITE_SKIP_TYPECHECK=true

# Run the build
RUN npm run build

# Production Stage
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Custom Nginx config to handle React routing
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
