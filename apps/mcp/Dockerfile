FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV MCP_HOST=0.0.0.0 MCP_PORT=3333
EXPOSE 3333
CMD ["node", "src/server.mjs", "--http"]
