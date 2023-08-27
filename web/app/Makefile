.PHONY: checkout
checkout:
	git clone https://github.com/wavey-ai/mel-spec.git
	git clone https://github.com/wavey-ai/soundkit.git
	git clone https://github.com/wavey-ai/opus-rs.git
	git clone https://github.com/timothygebhard/js-colormaps.git

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
	cd mel-spec/mel_spec_pipeline && wasm-pack build --target web --no-typescript --out-dir pkg
	#sed -i.bak "s/wasm_bindgen/wasm_bindgen_mel/g" build/mel_spec_pipeline.js
	cd mel-spec/mel_spec_audio && wasm-pack build --target web --no-typescript --out-dir pkg
	#sed -i.bak "s/wasm_bindgen/wasm_bindgen_wav/g" build/mel_spec_audio.js
	cd soundkit &&  wasm-pack build --no-default-features --target web --no-typescript --out-dir pkg --features wasm
	yarn add soundkit@file:./soundkit/pkg/
	yarn add mel_spec_pipeline@file:./mel-spec/mel_spec_pipeline/pkg/
	yarn add mel_spec_audio@file:./mel-spec/mel_spec_audio/pkg/
	#sed -i.bak "s/wasm_bindgen/wasm_bindgen_opus/g" build/soundkit.js
	yarn install && yarn run build
	cp soundkit/js/*work* build
	cat soundkit/js/ringbuffer.js soundkit/js/worklet.js > build/worklet.js
	cp js-colormaps/js-colormaps.js build
