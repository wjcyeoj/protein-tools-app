# Build stage
FROM node:20.11-alpine AS builder
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm ci || npm install
COPY apps/web/ ./
RUN npm run build || true

# Normalize output to /out (supports CRA `build/` and Vite `dist/`)
RUN mkdir -p /out && \
    if [ -d build ]; then cp -r build/* /out/; \
    elif [ -d dist ]; then cp -r dist/* /out/; \
    else echo "<h1>No build output found</h1>" > /out/index.html; fi

# Runtime
FROM nginx:1.27-alpine
COPY --from=builder /out /usr/share/nginx/html
# If you added a proxy config earlier:
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
