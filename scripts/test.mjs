import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const files=[];
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){const path=resolve(dir,entry.name);if(entry.isDirectory())await collect(path);else if(entry.isFile()&&/\.test\.(?:mjs|cjs|js)$/.test(entry.name))files.push(path);}}
await collect('tests');
for(const entry of await readdir('games',{withFileTypes:true}))if(entry.isDirectory())await collect(resolve('games',entry.name,'tests'));
if(!files.length)throw Error('No source tests found');
console.log(`Running ${files.length} source test files (tests/ and games/*/tests/)`);
const child=spawn(process.execPath,['--test',...files.sort()],{stdio:'inherit'});child.on('error',()=>process.exitCode=1);child.on('exit',code=>process.exitCode=code??1);
