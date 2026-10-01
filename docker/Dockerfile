FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
USER node
ENV PORT=7000
EXPOSE 7000
CMD ["npm", "start"]
