FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "dev"]
