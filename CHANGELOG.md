# Changelog

All notable changes to IntentLoom are documented here.

## Unreleased

- Fix CI type-checking in clean environments by removing the implicit `NodeJS` type dependency.
- Pin the Rust CI and release toolchain to Rust 1.88.0, which supports the locked Cargo dependency set.
- Upgrade React Router to 7.18.1 and use reproducible `npm ci` installs in CI.
- Route workspace selection and proxy status calls through registered Tauri commands.
- Implement the controller's Plan-mode bridge and restrict AI child-process environment variables to provider configuration keys.
- Reject insecure skill download URLs and enforce per-file and total ZIP extraction limits.
- Add the MIT license, tracked documentation links, and repository hygiene updates.
