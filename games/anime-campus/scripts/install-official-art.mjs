// Optional local preview assets. Original image bytes are embedded unchanged.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('assets-sources.json',root),'utf8'));
const out=new URL('web/assets/official/',root);await mkdir(out,{recursive:true});
for(const p of manifest.portraits){
 const response=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${p.character}: HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw Error(`${p.character}: source changed; review the new image before updating its recorded hash.`);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 86"><defs><clipPath id="round"><circle cx="43" cy="43" r="42"/></clipPath></defs><circle cx="43" cy="43" r="43" fill="#fffaf0"/><g clip-path="url(#round)"><svg width="86" height="86" viewBox="${p.display_viewbox.join(' ')}" preserveAspectRatio="xMidYMid slice"><image width="${p.width}" height="${p.height}" href="data:${p.mime};base64,${bytes.toString('base64')}"/></svg></g></svg>`;
 await writeFile(new URL(p.id+'.svg',out),svg);console.log(`Saved ${p.character}`);
}
console.log('Local assets: '+fileURLToPath(out)+' (ignored by Git)');
