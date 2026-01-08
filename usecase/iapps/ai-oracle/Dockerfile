FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# Set environment
ENV NODE_ENV=production

# Run the app
CMD ["node", "src/app.js"]
