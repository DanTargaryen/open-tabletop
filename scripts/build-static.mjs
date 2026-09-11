import {mkdir,cp,copyFile,rm,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'.dist/public');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await cp(resolve(root,'public'),out,{recursive:true});
await mkdir(resolve(out,'vendor'),{recursive:true});
await copyFile(resolve(root,'node_modules/three/build/three.module.js'),resolve(out,'vendor/three.module.js'));
await copyFile(resolve(root,'node_modules/three/build/three.core.js'),resolve(out,'vendor/three.core.js'));
await mkdir(resolve(out,'vendor/loaders'),{recursive:true});
await mkdir(resolve(out,'vendor/utils'),{recursive:true});
await copyFile(resolve(root,'node_modules/three/examples/jsm/loaders/GLTFLoader.js'),resolve(out,'vendor/loaders/GLTFLoader.js'));
await copyFile(resolve(root,'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),resolve(out,'vendor/utils/BufferGeometryUtils.js'));
await copyFile(resolve(root,'node_modules/three/examples/jsm/utils/SkeletonUtils.js'),resolve(out,'vendor/utils/SkeletonUtils.js'));
const catalog=JSON.parse(await readFile(resolve(root,'games/catalog.json'),'utf8'));
for(const game of catalog){if(!/^[a-z0-9-]+$/.test(game.id))throw Error('Invalid game id');await cp(resolve(root,'games',game.id,'web'),resolve(out,'games',game.id),{recursive:true});}
await copyFile(resolve(root,'games/catalog.json'),resolve(out,'games.json'));
console.log('Static assets: '+out+'\nMultiplayer requires the Node server or the Cloudflare Worker with migrated D1 storage.');
