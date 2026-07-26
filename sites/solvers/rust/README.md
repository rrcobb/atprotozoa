# solvers — rust sources

Each subdirectory here is a Cargo crate that compiles straight to
`wasm32-unknown-unknown` with plain `rustc`/`cargo` — no `wasm-bindgen`, no JS
codegen step. The crate exports raw pointers into its own static buffers;
`public/<name>/solver.js` gets a `WebAssembly.Memory` and reads/writes those
buffers directly as `Float32Array` views. This keeps the deploy path dumb: the
compiled `.wasm` is committed straight into `public/<name>/pkg/`, and
`wrangler deploy` just ships static assets — no Rust toolchain needed in CI.

## Rebuilding after an edit

```
rustup target add wasm32-unknown-unknown   # once
cd rust/magnetostatics
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/magnetostatics.wasm \
  ../../public/magnetostatics/pkg/magnetostatics.wasm
```

`target/` is gitignored; only the source and the built `.wasm` are committed.
