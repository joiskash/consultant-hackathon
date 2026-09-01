FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
# State lives on a mounted volume so restarts do not replay old alerts.
RUN mkdir -p /data
ENV STATE_FILE=/data/state.json
CMD ["node", "src/watch.js"]
