# Build stage
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

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy necessary directories
COPY --from=builder /app/src/data ./src/data

# Create required directories
RUN mkdir -p uploads/cvs uploads/projects uploads/temp logs

# Expose Railway's PORT
EXPOSE $PORT

# Start the application
CMD ["node", "dist/server.js"]