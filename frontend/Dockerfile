FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked in at build time — Vite env vars are compile-time, not runtime.
# Passed as build-args from docker-compose.prod.yml.
ARG VITE_API_URL
ARG VITE_SENTRY_DSN
ARG VITE_SANDBOX_AUTH
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_SANDBOX_AUTH=${VITE_SANDBOX_AUTH}
RUN npm run build

FROM nginx:1.27-alpine AS production
# Explicit dependency for the docker-compose healthcheck — nginx's alpine
# image doesn't reliably ship wget/curl across versions, so the healthcheck
# silently failed with "unhealthy" even though nginx itself was fine.
RUN apk add --no-cache curl
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-api-proxy.conf /etc/nginx/snippets/api-proxy.conf
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
