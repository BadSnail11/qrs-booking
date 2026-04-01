FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start", "--hostname", "0.0.0.0", "--port", "3000"]
