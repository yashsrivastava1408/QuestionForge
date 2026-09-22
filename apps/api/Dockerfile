FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai-orchestration/package.json ./packages/ai-orchestration/
COPY packages/sandbox/package.json ./packages/sandbox/
COPY packages/ingestion/package.json ./packages/ingestion/

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run db:generate

EXPOSE 4000
CMD ["npm", "run", "dev", "--workspace=apps/api"]
