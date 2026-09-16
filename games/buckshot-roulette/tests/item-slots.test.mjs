import test from 'node:test';
import assert from 'node:assert/strict';
import {findVisibleItemSlot} from '../web/item-slots.js';

const cell=(id,slot,faceUp=true)=>({id,faceUp,hinge:{userData:{pick:{slot}}}});

test('catch-up selects the used item after an earlier action shifts engine slots',()=>{
  const used=cell('cigarette',0,false),beer=cell('beer',1),saw=cell('saw',2);
  // The server now has [beer, saw]; saw is slot 1 while the scene still has old picks.
  assert.equal(findVisibleItemSlot([used,beer,saw],{slot:1,id:'saw'}),saw);
  assert.equal(findVisibleItemSlot([used,beer,saw],{slot:1,id:'magnifier'}),null);
});

test('valid slot mapping preserves the selected duplicate and ignores consumed items',()=>{
  const first=cell('beer',0),second=cell('beer',1),used=cell('saw',2,false);
  assert.equal(findVisibleItemSlot([first,second,used],{slot:1,id:'beer'}),second);
  assert.equal(findVisibleItemSlot([first,second,used],{slot:2,id:'saw'}),null);
});
