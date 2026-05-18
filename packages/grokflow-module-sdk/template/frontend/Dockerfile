FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_APP_NAME=Module

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN VITE_APP_NAME=$VITE_APP_NAME npm run build


FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx default config serves /usr/share/nginx/html — no extra config needed.
EXPOSE 80
