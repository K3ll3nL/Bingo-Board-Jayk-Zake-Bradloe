#!/usr/bin/env node
/**
 * Loads an Express app module and prints its registered route table as JSON,
 * in registration order. Run against both index.legacy.js and index.js and
 * diff the output to prove the split changed no routing behavior.
 *
 *   node api/scripts/verifySplit.js api/index.legacy.js > /tmp/before.json
 *   node api/scripts/verifySplit.js api/index.js        > /tmp/after.json
 *   diff /tmp/before.json /tmp/after.json
 */
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('usage: verifySplit.js <path-to-app-module>');
  process.exit(1);
}

const app = require(path.resolve(target));

const out = [];
for (const layer of app._router.stack) {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
    for (const m of methods.sort()) {
      out.push(`${m.toUpperCase()} ${layer.route.path}`);
    }
  } else {
    // Middleware: name it so ordering changes show up in the diff too.
    out.push(`MIDDLEWARE ${layer.name || 'anonymous'}`);
  }
}

console.log(JSON.stringify(out, null, 2));
