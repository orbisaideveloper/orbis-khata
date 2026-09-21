import '@testing-library/jest-dom/vitest'

// Test-only fallback for Android Node/Vitest without localStorage.
if (typeof window.localStorage === 'undefined') {
  const data = new Map<string, string>()

  const storage: Storage = {
    get length() { return data.size },
    clear() { data.clear() },
    getItem(key) { return data.get(key) ?? null },
    key(index) { return [...data.keys()][index] ?? null },
    removeItem(key) { data.delete(key) },
    setItem(key, value) { data.set(String(key), String(value)) },
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
}
