import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CARDS} from '../web/data.js';
import {ARTWORK,artworkPath} from '../web/artwork.js';

test('all 90 cards have 55 distinct, immutable local character illustrations',async()=>{
  assert.equal(Object.keys(ARTWORK).length,55);
  const paths=new Set(CARDS.map(artworkPath));assert.equal(paths.size,55);
  const hashes=new Set();
  for(const card of [...new Map(CARDS.map(c=>[c.speciesId,c])).values()]){
    const art=ARTWORK[card.speciesId];
    assert.equal(art.dexId,card.dexId);assert.equal(art.name,card.nameZh);
    assert.match(art.file,new RegExp('^'+String(card.dexId).padStart(3,'0')+'-[a-z-]+\\.svg$'));
    const svg=await readFile(new URL('../web/'+artworkPath(card),import.meta.url));
    assert.match(svg.toString(),/^<svg\b/);
    assert.doesNotMatch(svg.toString(),/<(?:script|foreignObject|text|image)\b|\bon\w+\s*=|(?:href|url\()|javascript:/i);
    const hash=createHash('sha256').update(svg).digest('hex');assert.equal(hash,art.sha256);hashes.add(hash);
  }
  assert.equal(hashes.size,55,'Every species must have its own artwork, not a shared stand-in');
});
test('missing or mismatched species never resolve to a numeric or generic substitute',()=>{
  assert.throws(()=>artworkPath({...CARDS[0],speciesId:'UNKNOWN'}),/Missing Pokemon artwork/);
  assert.throws(()=>artworkPath({...CARDS[0],dexId:999}),/Missing Pokemon artwork/);
});
