# Multi-stage Dockerfile untuk React frontend
# Stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack + yarn 1.x (project uses yarn.lock)
RUN corepack enable

# Copy manifests
COPY package.json yarn.lock ./

# Install deps
RUN yarn install --frozen-lockfile --network-timeout 300000

# Backend URL harus di-inject saat build karena CRA baca env di build time
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Copy source & build
COPY . .
RUN yarn build

# Stage 2: nginx runtime
FROM nginx:1.27-alpine AS runtime

# Custom nginx config untuk SPA (fallback ke index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy hasil build
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
