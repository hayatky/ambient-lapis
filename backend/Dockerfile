# syntax=docker/dockerfile:1.7
FROM golang:1.26.5-alpine3.23 AS build

WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY backend/ ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ambient-lapis ./cmd/ambient-lapis

FROM alpine:3.23

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 10001 ambient \
    && adduser -S -D -H -u 10001 -G ambient ambient
WORKDIR /app
COPY --from=build --chown=ambient:ambient /out/ambient-lapis /app/ambient-lapis

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/ambient-lapis"]
