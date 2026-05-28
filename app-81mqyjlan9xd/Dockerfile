# Use pre-built dist/ from the repo directly — no build step needed.
# VITE_ variables are already baked into the committed dist/index.html.
# This avoids the need to pass build args on the VPS.
FROM nginx:stable-alpine

COPY dist /usr/share/nginx/html

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
