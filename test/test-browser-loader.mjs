/**
 * Test Browser Loader
 * Mocks a browser environment for Node.js tests.
 */
import { GlobalWindow } from 'happy-dom';

const window = new GlobalWindow();
global.window = window;
global.document = window.document;

Object.defineProperty(global, 'navigator', {
  value: window.navigator,
  configurable: true,
  writable: true
});

global.location = window.location;
global.CustomEvent = window.CustomEvent;
global.HTMLElement = window.HTMLElement;
global.MutationObserver = window.MutationObserver;
global.Node = window.Node;
global.Request = window.Request;
global.Response = window.Response;
global.Headers = window.Headers;
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

// Mock Lucide and other browser globals used in modules
global.L = { 
  map: () => ({ setView: () => ({}), on: () => ({}), remove: () => ({}) }),
  tileLayer: () => ({ addTo: () => ({}) }),
  marker: () => ({ addTo: () => ({ bindPopup: () => ({ openPopup: () => ({}) }) }), remove: () => ({}) }),
  circle: () => ({ addTo: () => ({ bindPopup: () => ({}) }) })
};

import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('/')) {
    const filePath = join(publicDir, specifier);
    return {
      url: pathToFileURL(filePath).href,
      shortCircuit: true
    };
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  return defaultLoad(url, context, defaultLoad);
}
