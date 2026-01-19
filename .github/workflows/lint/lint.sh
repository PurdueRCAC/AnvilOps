#!/bin/bash

CURRENT_DIR=$(dirname "$0")
PROJECT_ROOT="$PWD/$CURRENT_DIR/../../../"

cd "$PROJECT_ROOT"

ERROR=0

check_error() {
  if [ $? -ne 0 ]; then
    echo "Command exited with an error"
    ERROR=1
  else
    echo "Success"
  fi
}

# Shellcheck: shell scripts
printf "\n======================================\nRunning Shellcheck\n======================================\n"
find . -name "*.sh" -and -not -wholename '**node_modules**' -exec shellcheck {} +
check_error

# Hadolint: Dockerfiles
printf "\n======================================\nRunning Hadolint\n======================================\n"
find . -name "*Dockerfile" -exec hadolint {} +
check_error

# golangci-lint: Go files
printf "\n======================================\nRunning golangci-lint (log-shipper)\n======================================\n"
cd $PROJECT_ROOT/log-shipper
golangci-lint run ./...
check_error

printf "\n======================================\nRunning golangci-lint (regclient-napi)\n======================================\n"
cd $PROJECT_ROOT/backend/regclient-napi
npx node-gyp configure

NAPI_HEADER_DIR=$(node -p 'require("node-addon-api").include' | cut -d\" -f 2 -)
NODE_HEADER_DIR="$(cat build/config.gypi | grep nodedir | cut -d\" -f 4 -)/include/node"
cd src

go build -o ../gobuild/main.a -buildmode=c-archive main.go
export CGO_CXXFLAGS="-I../gobuild -I$NODE_HEADER_DIR -I$NAPI_HEADER_DIR"

golangci-lint run ./...

check_error

# ESLint: TypeScript files
cd $PROJECT_ROOT/openapi
npm run generate

cd $PROJECT_ROOT/backend
npx prisma generate

printf "\n======================================\nRunning eslint (frontend)\n======================================\n"
cd $PROJECT_ROOT/frontend
npm run lint
check_error

printf "\n======================================\nRunning eslint (backend)\n======================================\n"
cd $PROJECT_ROOT/backend
npm run lint
check_error

printf "\n======================================\nRunning eslint (filebrowser)\n======================================\n"
cd $PROJECT_ROOT/filebrowser
npm run lint
check_error

exit $ERROR
