# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build


# ---- Production stage ----
FROM node:18-alpine

WORKDIR /app

######################################
# Install Chromium + deps for Puppeteer
######################################
RUN apk update && apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  udev

# Puppeteer config
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
######################################

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy src/data if needed at runtime
COPY --from=builder /app/src/data ./src/data

# Directories your app expects
RUN mkdir -p uploads/cvs uploads/projects uploads/temp logs cached

# Expose Railway's port (they inject PORT env)
EXPOSE $PORT

# Start the app
CMD ["node", "dist/server.js"]
