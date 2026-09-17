// Node loader hook so the render modules' bare `three` / `three/addons/…` imports resolve to
// the vendored copies (the browser uses the import map in index.html).
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'three') return next(new URL('../vendor/three/three.module.js', ${JSON.stringify(import.meta.url)}).href, context);
    if (specifier.startsWith('three/addons/')) return next(new URL('../vendor/three/addons/' + specifier.slice('three/addons/'.length), ${JSON.stringify(import.meta.url)}).href, context);
    return next(specifier, context);
  }
`), import.meta.url);
