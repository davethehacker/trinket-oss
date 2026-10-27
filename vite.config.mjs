import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = import.meta.dirname;

export default defineConfig({
  // Build CSS assets only (Hapi serves the app)
  // outDir is public/ itself, so don't also copy public/ into it: the copy
  // overwrites files with themselves and fails (EACCES) when the container
  // user cannot write to the bind-mounted checkout.
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        base: resolve(root, 'static/scss/base.scss'),
        embed: resolve(root, 'static/scss/embed/embed.scss'),
      },
      output: {
        assetFileNames: (assetInfo) => {
          // Output CSS files to css/ directory
          if (assetInfo.name.endsWith('.css')) {
            return 'css/[name].css';
          }
          return 'assets/[name].[ext]';
        },
      },
    },
    cssCodeSplit: true,
    // Keep the browser support of the previous (Vite 4) build. Newer Vite
    // targets only recent browsers and would emit e.g. media query range
    // syntax that older school devices (Safari < 16.4) ignore.
    cssTarget: ['chrome87', 'edge88', 'firefox78', 'safari14'],
    // Vite 8 minifies CSS with Lightning CSS by default, which rewrites e.g.
    // Foundation's translate3d()/translateZ(0) GPU-layer hacks into plain
    // translate(). esbuild (the Vite 4 default) leaves them intact.
    cssMinify: 'esbuild',
    sourcemap: true,
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Vite >= 6 uses Sass's modern API, which no longer treats the working
        // directory as an implicit load path. The stylesheets import
        // "public/components/..." relative to the project root, so add it.
        loadPaths: [root],
      },
    },
  },
});
