// Rebuild the checked-in credentials bundle after changing its source.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const license = fs.readFileSync(path.join(root, 'node_modules/@noble/hashes/LICENSE'), 'utf8');
esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['tools/credentials-entry.js'],
  outfile: 'src/js/credentials.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  banner: { js: '/*\n' + license.replace(/\*\//g, '* /') + '\n*/' }
});
console.log('src/js/credentials.js reconstruit');
