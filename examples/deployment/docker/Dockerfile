FROM node:14 AS typescript-build

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY /build.sh build.sh
COPY .work /adr-gateway

RUN chmod +x build.sh && ./build.sh

FROM node:14-alpine

COPY --from=typescript-build /adr-gateway/dist /adr-gateway
WORKDIR /adr-gateway
RUN npm i --only prod
RUN npm i --only prod pg