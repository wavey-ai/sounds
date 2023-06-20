FROM public.ecr.aws/j7u2k1c9/media-base:latest

ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
ENV GOOS=linux
ENV GOARCH=amd64
RUN go build -o main

RUN chmod +x ./process.sh

ENTRYPOINT [ "/app/main" ]
