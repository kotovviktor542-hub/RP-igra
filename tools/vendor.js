/* vendor.js — копирует three.js из node_modules в www/vendor.
   Запускается в CI перед сборкой, чтобы в репозитории не лежал минифицированный бандл. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www', 'vendor');
fs.mkdirSync(out, { recursive: true });

const three = path.join(root, 'node_modules', 'three', 'build', 'three.module.min.js');
const utils = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js');

if (!fs.existsSync(three)) {
  console.error('three.js не найден — сначала npm install');
  process.exit(1);
}

fs.copyFileSync(three, path.join(out, 'three.module.js'));

const copyJsm = (rel, file) => {
  const srcPath = path.join(root, 'node_modules', 'three', 'examples', 'jsm', ...rel);
  const src = fs.readFileSync(srcPath, 'utf8')
    .replace(/from 'three'/g, "from './three.module.js'")
    .replace(/from '\.\.\/utils\/BufferGeometryUtils\.js'/g, "from './BufferGeometryUtils.js'");
  fs.writeFileSync(path.join(out, file), src);
};

copyJsm(['utils', 'BufferGeometryUtils.js'], 'BufferGeometryUtils.js');
copyJsm(['loaders', 'GLTFLoader.js'], 'GLTFLoader.js');
copyJsm(['utils', 'SkeletonUtils.js'], 'SkeletonUtils.js');

console.log('vendor: three.module.js, BufferGeometryUtils, GLTFLoader, SkeletonUtils обновлены');
