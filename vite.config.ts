import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Polyfill: replace CSS light-dark(a, b) with just `a` (light value)
// Safari < 17.5 doesn't support light-dark(), causing blank page
function lightDarkPolyfill() {
  function replaceLightDark(css: string): string {
    let result = '';
    let i = 0;
    while (i < css.length) {
      const idx = css.indexOf('light-dark(', i);
      if (idx === -1) { result += css.slice(i); break; }
      result += css.slice(i, idx);
      const start = idx + 'light-dark('.length;
      let depth = 1;
      let j = start;
      while (j < css.length && depth > 0) {
        if (css[j] === '(') depth++;
        else if (css[j] === ')') depth--;
        j++;
      }
      const args = css.slice(start, j - 1);
      let argDepth = 0;
      let split = -1;
      for (let k = 0; k < args.length; k++) {
        if (args[k] === '(') argDepth++;
        else if (args[k] === ')') argDepth--;
        else if (args[k] === ',' && argDepth === 0) { split = k; break; }
      }
      result += split >= 0 ? args.slice(0, split) : args;
      i = j;
    }
    return result;
  }
  return {
    name: 'light-dark-polyfill',
    enforce: 'post' as const,
    apply: 'build' as const,
    generateBundle(_: any, bundle: any) {
      for (const file of Object.keys(bundle)) {
        if (file.endsWith('.css')) {
          const asset = bundle[file];
          if (asset.type === 'asset' && typeof asset.source === 'string') {
            asset.source = replaceLightDark(asset.source);
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), lightDarkPolyfill()],
})
