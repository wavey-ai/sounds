clean:
	rm -rf mel-spec
	rm -rf js-colormaps
	rm -rf soundkit

.PHONY: build
build: clean
	npm i && npm run build
	git clone https://github.com/wavey-ai/mel-spec.git
	cd ./mel-spec/mel_spec_pipeline && wasm-pack build --target no-modules --no-typescript --out-dir ../../build --debug
	sed -i.bak "s/wasm_bindgen/wasm_bindgen_mel/g" build/mel_spec_pipeline.js
	cd ./mel-spec/mel_spec_audio && wasm-pack build --target no-modules --no-typescript --out-dir ../../build --debug
	sed -i.bak "s/wasm_bindgen/wasm_bindgen_wav/g" build/mel_spec_audio.js
	git clone https://github.com/wavey-ai/soundkit.git
	cd soundkit && wasm-pack build --target no-modules --no-typescript --out-dir ../build --debug
	sed -i.bak "s/wasm_bindgen/wasm_bindgen_opus/g" build/soundkit.js
	cp src/*.js build
	cp soundkit/js/* build
	cat soundkit/js/ringbuffer.js src/worklet.js > build/worklet.js
	git clone https://github.com/timothygebhard/js-colormaps.git
	cp js-colormaps/js-colormaps.js build
