import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAt} from '../web/animation.js';
test('an earlier RAF timestamp stays at the start rather than indexing a negative route position',()=>{const r=[{x:192,y:1230},{x:190,y:1120}];assert.deepEqual(routeAt(r,-.01),r[0]);assert.deepEqual(routeAt(r,1.1),r[1]);assert.deepEqual(routeAt([r[0]],.5),r[0]);assert.deepEqual(routeAt(r,.5),{x:191,y:1175});});
