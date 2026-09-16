import * as THREE from '/vendor/three.module.js';

// Sculpted in local coordinates, facing +Z. Open facial apertures have inset walls;
// no solid sphere sits behind the eyes. Separate head preserves the existing rig.
export function createDealerSculpt(glow) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#e4d6ba';ctx.fillRect(0,0,256,256);
  let grain=913;
  const rand=()=>{grain=(grain*1664525+1013904223)>>>0;return grain/4294967296;};
  for(let i=0;i<8500;i++){
    ctx.fillStyle=`rgba(98,73,39,${.025+rand()*.095})`;
    ctx.beginPath();ctx.ellipse(rand()*256,rand()*256,.3+rand()*1.4,.4+rand()*2,rand()*Math.PI,0,Math.PI*2);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const bone = new THREE.MeshStandardMaterial({color:0xc6aa78,roughness:.88,map:texture,flatShading:true,vertexColors:true});
  const dark = new THREE.MeshStandardMaterial({color:0x140c08,roughness:1,side:THREE.DoubleSide});
  const head=new THREE.Group(), torso=new THREE.Group(), eyes=[];
  let seed=17;
  function mesh(parent,g,p=[0,0,0],scale=[1,1,1],material=bone){
    if(material===bone){
      if(g.index)g=g.toNonIndexed();
      const a=g.attributes.position, colors=[];
      for(let i=0;i<a.count;i+=3){
        seed=(seed*1664525+1013904223)>>>0;
        const v=.91+(seed/4294967296)*.09;
        for(let j=0;j<3;j++)colors.push(v,v*.99,v*.97);
      }
      g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    }
    const m=new THREE.Mesh(g,material);m.position.set(...p);m.scale.set(...scale);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function path(points){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
  function plate(parent,points,z,depth,holes=[]){
    const s=path(points);for(const points of holes)s.holes.push(new THREE.Path(path(points).getPoints()));
    return mesh(parent,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.005,bevelThickness:.004,curveSegments:1}),[0,0,z]);
  }
  function tube(parent,points,radius,segments=16){
    return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,5,false));
  }
  // One tapered cranial shell blends into the brow rather than overhanging it.
  const cranialRings=[ [.211,.002,.002],[.195,.073,.066],[.155,.135,.113],[.101,.169,.14],[.056,.164,.13],[.019,.146,.104] ];
  const cv=[], cu=[], segments=20;
  const vertex=(ring,j)=>{
    const [y,rx,rz]=cranialRings[ring],a=j/segments*Math.PI*2;
    const front=Math.cos(a),x=Math.sin(a)*rx;
    const lower=ring===cranialRings.length-1;
    return [x,lower?(front>0?.004+.038*Math.abs(Math.sin(a)):-.049):y,front*rz-.003];
  };
  for(let r=0;r<cranialRings.length-1;r++)for(let j=0;j<segments;j++){
    if(Math.cos((j+.5)/segments*Math.PI*2)>0)continue;
    for(const [rr,jj] of [[r,j],[r+1,j],[r+1,j+1],[r,j],[r+1,j+1],[r,j+1]]){
      cv.push(...vertex(rr,jj));cu.push(jj/segments,rr/(cranialRings.length-1));
    }
  }
  const crown=new THREE.BufferGeometry();crown.setAttribute('position',new THREE.Float32BufferAttribute(cv,3));
  crown.setAttribute('uv',new THREE.Float32BufferAttribute(cu,2));crown.computeVertexNormals();mesh(head,crown);
  const orbit=[[.023,.001],[.063,.018],[.122,.043],[.142,.023],[.139,-.027],[.112,-.055],[.069,-.058],[.035,-.039]].map(([x,y])=>[x*.89,y*.9]);
  const nose=[[-.022,-.108],[-.025,-.092],[-.008,-.053],[.008,-.053],[.025,-.092],[.022,-.108],[0,-.099]];
  const outline=[[-.146,.025],[-.164,.056],[-.169,.101],[-.135,.155],[-.073,.195],[0,.211],[.073,.195],[.135,.155],[.169,.101],[.164,.056],[.146,.025],[.148,-.042],[.126,-.079],[.077,-.091],[.060,-.14],[-.060,-.14],[-.077,-.091],[-.126,-.079],[-.148,-.042]];
  const left=orbit.map(([x,y])=>[-x,y]).reverse();
  const face=plate(head,outline,.067,.033,[orbit,left,nose]);
  // Subdivide before shaping: the brow and forehead are one continuous curved
  // surface, with real holes retained, rather than a flat plate on a dome.
  const source=face.geometry, positions=[],uvs=[];
  const pa=source.attributes.position,ua=source.attributes.uv;
  function subdivide(a,b,c,depth){
    const length=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
    if(depth<4&&Math.max(length(a,b),length(b,c),length(c,a))>.039){
      const mid=(p,q)=>p.map((v,i)=>(v+q[i])/2),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      subdivide(a,ab,ca,depth+1);subdivide(ab,b,bc,depth+1);subdivide(ca,bc,c,depth+1);subdivide(ab,bc,ca,depth+1);return;
    }
    for(const v of [a,b,c]){positions.push(...v.slice(0,3));uvs.push(v[3]*4+.5,v[4]*4+.5);}
  }
  for(let i=0;i<pa.count;i+=3){
    const v=j=>[pa.getX(j),pa.getY(j),pa.getZ(j),ua.getX(j),ua.getY(j)];subdivide(v(i),v(i+1),v(i+2),0);
  }
  const shaped=new THREE.BufferGeometry();shaped.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  shaped.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const pos=shaped.attributes.position,colors=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i);
    if(y>.033){
      const blend=THREE.MathUtils.smoothstep(y,.033,.075);
      const surface=Math.sqrt(Math.max(0,1-(x/.178)**2-((y-.062)/.15)**2))*.145-.017;
      pos.setZ(i,pos.getZ(i)+(surface-.10)*blend);
    }
    colors.push(.97,.96,.94);
  }
  shaped.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));shaped.computeVertexNormals();
  face.geometry=shaped;source.dispose();
  // Close the temples between the face and the rear shell for oblique views.
  const sideVertices=[];
  const frontPoint=([x,y])=>{
    const blend=THREE.MathUtils.smoothstep(y,.033,.075);
    const surface=Math.sqrt(Math.max(0,1-(x/.178)**2-((y-.062)/.15)**2))*.145-.017;
    return [x,y,.10+(y>.033?(surface-.10)*blend:0)];
  };
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    if(a[1]<-.08||b[1]<-.08)continue;
    const af=frontPoint(a),bf=frontPoint(b),ab=[a[0],a[1],-.045],bb=[b[0],b[1],-.045];
    sideVertices.push(...af,...ab,...bb,...af,...bb,...bf);
  }
  const sides=new THREE.BufferGeometry();sides.setAttribute('position',new THREE.Float32BufferAttribute(sideVertices,3));sides.computeVertexNormals();
  const temples=mesh(head,sides);temples.material=bone.clone();temples.material.side=THREE.DoubleSide;

  for(const sign of [-1,1]){
    const rim=orbit.map(([x,y])=>[sign*x,y,.101]);
    const inset=orbit.map(([x,y])=>[sign*(.074+(x-.074)*.78),-.013+(y+.013)*.78,.033]);
    const vertices=[];
    for(let i=0;i<rim.length;i++){const j=(i+1)%rim.length;vertices.push(...rim[i],...rim[j],...inset[j],...rim[i],...inset[j],...inset[i]);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
    mesh(head,g,[0,0,0],[1,1,1],new THREE.MeshStandardMaterial({color:0x604526,roughness:1,side:THREE.DoubleSide,flatShading:true}));
    mesh(head,new THREE.SphereGeometry(.058,10,7),[sign*.074,-.014,.014],[.88,.75,.36],dark);

    mesh(head,new THREE.IcosahedronGeometry(.029,0),[sign*.125,-.062,.073],[1,.64,.7]);
    tube(head,[[sign*.136,-.067,.072],[sign*.107,-.123,.029],[sign*.088,-.178,.06],[sign*.054,-.203,.099],[0,-.211,.113]],.017,9);
    const ember=mesh(head,new THREE.SphereGeometry(.0035,8,6),[sign*.074,-.009,.043],[1,1,1],new THREE.MeshBasicMaterial({color:0xffb44f,toneMapped:false}));
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0xff6d18,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));
    halo.position.set(sign*.074,-.009,.046);halo.scale.set(.025,.025,1);head.add(halo);eyes.push(ember,halo);
  }
  // Horseshoe dental arches: incisors in front, molars recede at the sides.
  for(const [y,r] of [[-.134,.077],[-.183,.072]]){
    const arch=[];
    for(let i=0;i<=16;i++){const a=-Math.PI/2+i*Math.PI/16;arch.push([Math.sin(a)*r,y,.051+Math.cos(a)*.071]);}
    tube(head,arch,.012);
    for(let i=0;i<12;i++){
      const a=-1.4+i*2.8/11;
      const tooth=mesh(head,new THREE.SphereGeometry(1,7,5),[Math.sin(a)*r,y+(y>-.15?-.012:.013),.055+Math.cos(a)*.075],[.009,.016,.011]);tooth.rotation.y=-a;
    }
  }
  plate(head,[[-.069,-.185],[-.046,-.217],[0,-.232],[.046,-.217],[.069,-.185],[.043,-.196],[0,-.202],[-.043,-.196]],.074,.028);
  const eyeLight=new THREE.PointLight(0xff6827,.06,.32,2);eyeLight.position.set(0,-.015,.14);head.add(eyeLight);
  // Segmented spine and paired curved ribs attach at the back and sternum.
  for(let i=0;i<14;i++){
    const y=.493-i*.046;
    mesh(torso,new THREE.CylinderGeometry(.029,.034,.035,7),[0,y,-.054]);
    if(i>3)mesh(torso,new THREE.IcosahedronGeometry(.022,0),[0,y,-.083],[1.8,.55,1]);
  }
  for(let i=0;i<7;i++){
    const y=.383-i*.054, width=[.153,.182,.199,.204,.198,.183,.163][i];
    for(const s of [-1,1])tube(torso,[[s*.021,y,-.072],[s*width*.75,y+.014,-.086],[s*width,y-.011,-.009],[s*width*.85,y-.053,.092],[s*.09,y-.068,.143],[s*.022,y-.045+(i>3?(i-3)*.012:0),.15]],.0115,18);
  }
  plate(torso,[[-.03,.382],[-.043,.344],[-.022,.292],[-.022,.157],[0,.097],[.022,.157],[.022,.292],[.043,.344],[.03,.382],[0,.367]],.14,.021);
  for(const s of [-1,1]){
    tube(torso,[[s*.027,.381,.158],[s*.09,.398,.123],[s*.173,.423,.065],[s*.244,.436,.012]],.016,8);
    mesh(torso,new THREE.IcosahedronGeometry(.043,1),[s*.246,.427,.007],[1,.6,.9]);
    plate(torso,[[s*.08,.414],[s*.22,.421],[s*.193,.27],[s*.13,.3]],-.087,.02);
  }
  return {head,torso,eyes,eyeLight};
}

// Unit-length bone profiles remain compatible with the existing two-bone IK.
export function sculptArmBone(radius,material,paired=false){
  const group=new THREE.Group();
  const profile=[[.48,1.15],[.42,1.1],[.31,.66],[0,.48],[-.31,.62],[-.43,1.04],[-.48,1.13]];
  const count=paired?2:1;
  for(let k=0;k<count;k++){
    const points=profile.slice().reverse().map(([y,r])=>new THREE.Vector2(radius*r*(paired?.54:1),y));
    const m=new THREE.Mesh(new THREE.LatheGeometry(points,7),material);
    m.position.x=paired?(k?1:-1)*radius*.46:0;m.castShadow=true;group.add(m);
  }
  return group;
}
