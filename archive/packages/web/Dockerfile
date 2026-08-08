FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages packages
RUN npm install --workspaces
COPY . .
RUN npm run build --workspace=packages/web
EXPOSE 5173
CMD ["npm", "run", "preview", "-w", "packages/web"]
