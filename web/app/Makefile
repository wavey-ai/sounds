.PHONY: checkout
checkout:
	git clone https://github.com/wavey-ai/mel-spec.git
	git clone https://github.com/wavey-ai/soundkit.git
	git clone https://github.com/wavey-ai/opus-rs.git

.PHONY: update
update:
	cd mel-spec && git pull
	cd soundkit && git pull
	cd opus-rs && git pull

.PHONY: build
build: checkout _build

.PHONY: build_local
build_local: update _build

.PHONY: _build

_build:
	yarn install && yarn run build
	cd mel-spec/mel_spec_pipeline && wasm-pack build --target no-modules --no-typescript --out-dir ../../dist
	sed -i.bak "s/wasm_bindgen/wasm_bindgen_mel/g" dist/mel_spec_pipeline.js
	cd mel-spec/mel_spec_audio && wasm-pack build --target no-modules --no-typescript --out-dir ../../dist
	sed -i.bak "s/wasm_bindgen/wasm_bindgen_wav/g" dist/mel_spec_audio.js
	cd soundkit &&  wasm-pack build --no-default-features --target no-modules --no-typescript --out-dir ../dist --features wasm
	sed -i.bak "s/wasm_bindgen/wasm_bindgen_pkt/g" dist/soundkit.js
	cp soundkit/js/* dist
	cat soundkit/js/ringbuffer.js soundkit/js/worklet.js > dist/worklet.js
