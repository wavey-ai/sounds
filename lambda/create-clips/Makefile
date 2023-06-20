.PHONY: build
build:
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
