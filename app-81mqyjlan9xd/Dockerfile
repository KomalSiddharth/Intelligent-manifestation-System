# Production Stage (No build inside Docker to save VPS resources)
FROM nginx:stable-alpine

# Copy the PRE-BUILT dist folder from your local machine (pushed to git)
COPY ./dist /usr/share/nginx/html

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
