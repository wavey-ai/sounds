FROM public.ecr.aws/j7u2k1c9/media-base:latest

ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig

WORKDIR /app

RUN git clone https://github.com/wavey-ai/opus-rs.git
RUN git clone https://github.com/wavey-ai/soundkit.git sk

RUN cd sk && git checkout develop && make && cp target/debug/soundkit /app/
RUN chmod +x ./soundkit

COPY go.mod go.sum ./
RUN go mod download

COPY . .
ENV GOOS=linux
ENV GOARCH=amd64
RUN go build -o main

RUN chmod +x ./process.sh

ENTRYPOINT [ "/app/main" ]
