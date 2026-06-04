// jsdom is missing matchMedia + structuredClone + ResizeObserver in some
// environments; polyfill the bits Zustand and our stores touch.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
}
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
