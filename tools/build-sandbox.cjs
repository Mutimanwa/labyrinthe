// Rebuild the checked-in offline QuickJS runtime after changing its source.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const license = fs.readFileSync(path.join(__dirname, 'QUICKJS-LICENSE.txt'), 'utf8');
esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['tools/sandbox-entry.js'],
  outfile: 'src/js/quickjs-runtime.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  banner: { js: '/*\n' + license.replace(/\*\//g, '* /') + '\n*/' }
});
console.log('src/js/quickjs-runtime.js reconstruit');
