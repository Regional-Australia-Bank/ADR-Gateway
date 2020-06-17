FROM alpine:latest

# Install node
RUN apk add 'nodejs>14'
RUN apk add npm

# Install the production dependencies
COPY dist /dist

# TODO: Fix: For some reason I still can't get sqlite3 to install using package.json.
# TODO: Ensure puppeteer is not installed - this is not needed in production!
RUN cd /dist && npm install --only=prod
RUN npm install --only=prod pg mysql sqlite3