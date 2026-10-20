# ---- Stage 1: build static assets (dev tooling stays in this stage only) ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same-origin default keeps ONE image valid for Staging and Production.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---- Stage 2: lean runtime ----
# nginx-unprivileged ships a non-root user (uid 101) as the final USER,
# which is what the Trivy misconfiguration gate requires (DS-0002). An
# unprivileged process cannot bind a port below 1024, so nginx listens on
# 8080 inside the container and the host maps 80 or 8080 onto it.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Pull the base image's OS packages up to the patched versions. apk needs
# root, so this runs before the unprivileged user is restored below.
USER root
RUN apk upgrade --no-cache

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Inherited from the base image, but declared explicitly: Trivy reads the
# Dockerfile statically and does not inspect the base image, so an inherited
# USER still trips DS-0002.
USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
