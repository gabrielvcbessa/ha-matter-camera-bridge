FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY scripts ./scripts

ENV MATTER_SIDECAR_PORT=8090
ENV BRIDGE_URL=http://stream-to-matter:8080

EXPOSE 8090
CMD ["npm", "start"]
