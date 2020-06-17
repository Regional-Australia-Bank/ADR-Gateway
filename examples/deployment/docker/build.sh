#/bin/bash

if [ ! -z "${HTTP_PROXY}" ]; then
    git config --global --add http.proxy ${HTTP_PROXY}
    npm config set proxy ${HTTP_PROXY}
fi

if [ ! -z "${HTTPS_PROXY}" ]; then
    git config --global --add https.proxy ${HTTPS_PROXY}
    npm config set https-proxy ${HTTPS_PROXY}
fi

cd adr-gateway

echo "Installing packages..."
npm i

echo "Typescript version:"
npx tsc --version

echo "Building..."
npm run build