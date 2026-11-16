FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production
ENV PORT=10000
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "server.js"]
