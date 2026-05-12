# Multi-stage build. The dev image is for `docker compose up` against a hot
# local copy; the runtime image serves a prebuilt static bundle via nginx and
# is what we ship on the VPS.
#
# Pick a stage with `docker compose --profile prod` or `--target prod`.

# ----- builder: produces /app/dist with the production Vite build ------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ----- dev: vite dev server with HMR ----------------------------------------
# Default target so local `docker compose up` keeps the old behavior — hot
# reloads on file change, no rebuild needed.
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ----- prod: nginx serving the built static bundle --------------------------
FROM nginx:1.27-alpine AS prod
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA fallback: any path that doesn't match a file → /index.html so client-side
# routes (react-router) work on direct visit / refresh.
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 5173;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Long-cache hashed assets, short-cache html.
    location ~* \.(js|css|woff2?|png|jpg|jpeg|svg|gif|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
EXPOSE 5173
