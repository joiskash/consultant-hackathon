FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages packages
RUN npm install --workspaces
COPY . .
RUN npm run build --workspaces
EXPOSE 3000
CMD ["node", "packages/engine/dist/index.js"]
