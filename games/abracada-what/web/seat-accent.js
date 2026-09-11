import * as THREE from '/vendor/three.module.js';
import {characterForKey} from './characters.js';

export function createSeatAccent(characterKey){
  const character=characterForKey(characterKey),seat=character.seat,color=new THREE.Color(character.color),group=new THREE.Group();
  const geometries=[
    new THREE.OctahedronGeometry(.105,0),
    new THREE.SphereGeometry(.1,14,10),
    new THREE.BoxGeometry(.15,.15,.15),
    new THREE.ConeGeometry(.105,.22,10),
    new THREE.TorusGeometry(.09,.035,8,18),
  ];
  const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.7,roughness:.24,metalness:.34});
  const gem=new THREE.Mesh(geometries[seat],material);gem.position.set(seat%2?.42:-.42,1.7,.03);gem.rotation.set(.35,seat*.62,.2);gem.castShadow=true;gem.userData.disposable=true;group.add(gem);
  group.userData.seatAccent=true;return group;
}

export function createCharacterBeam(color){
  const group=new THREE.Group(),beamColor=new THREE.Color(color);
  const outerMaterial=new THREE.MeshBasicMaterial({color:beamColor,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  const innerMaterial=new THREE.MeshBasicMaterial({color:0xfff2bf,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  const outer=new THREE.Mesh(new THREE.CylinderGeometry(.16,.78,4.8,40,1,true),outerMaterial);outer.position.y=2.42;outer.userData.disposable=true;group.add(outer);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(.05,.4,4.55,32,1,true),innerMaterial);inner.position.y=2.48;inner.userData.disposable=true;group.add(inner);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(.76,48),new THREE.MeshBasicMaterial({color:beamColor,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.rotation.x=-Math.PI/2;glow.position.y=.035;glow.userData.disposable=true;group.add(glow);
  const target=new THREE.Object3D();target.position.set(0,.72,0);group.add(target);
  const spotlight=new THREE.SpotLight(beamColor,42,7.5,.28,.72,1.35);spotlight.position.set(0,4.85,.45);spotlight.target=target;group.add(spotlight);
  group.visible=false;group.userData.outer=outer;group.userData.inner=inner;group.userData.glow=glow;group.userData.spotlight=spotlight;return group;
}

export function updateCharacterBeam(beam,time){
  if(!beam?.visible)return;
  const pulse=(Math.sin(time*.0024)+1)/2;
  beam.userData.outer.material.opacity=.12+pulse*.055;beam.userData.inner.material.opacity=.075+pulse*.035;
  beam.userData.glow.material.opacity=.19+pulse*.12;beam.userData.glow.scale.setScalar(.94+pulse*.1);beam.userData.spotlight.intensity=38+pulse*12;
}
