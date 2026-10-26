#!/usr/bin/env node
// Fails (exit 1) when running on a Node.js release that is affected by
// CVE-2026-111497, the out-of-bounds write in Node's bundled Brotli decoder
// (zlib.brotliDecompress, Content-Encoding: br bodies, fetch() responses).
// Fixed releases: 22.23.4, 24.22.1, 26.12.1. All other lines are end-of-life.
// Used by the Dockerfile so a stale cached base image cannot be shipped.
var FIXED = {
  22: [23, 4],
  24: [22, 1],
  26: [12, 1]
};

var parts = process.versions.node.split('.').map(Number);
var fixed = FIXED[parts[0]];
var ok = fixed && (parts[1] > fixed[0] || (parts[1] === fixed[0] && parts[2] >= fixed[1]));

if (!ok) {
  console.error('Node.js ' + process.version + ' is affected by CVE-2026-111497 (Brotli decoder). ' +
    'Use Node.js >= 22.23.4 (or 24.22.1 / 26.12.1).');
  process.exit(1);
}

console.log('Node.js ' + process.version + ': not affected by CVE-2026-111497');
