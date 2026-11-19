import * as THREE from 'three';
import {COCKPIT, cockpitWheelAngle, cockpitWrist} from '../../../shared/camera.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const point = (x, y, z) => new THREE.Vector3(x, y, z);
function connect(mesh, a, b) {
  const direction = b.clone().sub(a); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.y = direction.length();
  mesh.quaternion.setFromUnitVectors(point(0, 1, 0), direction.normalize());
}

export class Driver {
  constructor(parent) {
    this.root = new THREE.Group(); this.root.position.set(.346, 1.0967, -.4882); this.root.rotation.y = Math.PI; this.root.scale.setScalar(.86); parent.add(this.root);
    this.wheel = new THREE.Group(); this.wheel.position.set(0, COCKPIT.centerY, COCKPIT.centerZ); this.wheel.rotation.x = COCKPIT.tilt; this.root.add(this.wheel);
    this.grips = new THREE.Group(); this.wheel.add(this.grips);
    const glove = new THREE.MeshStandardMaterial({color: '#283338', roughness: .87});
    const patch = new THREE.MeshStandardMaterial({color: '#151b1e', roughness: .94});
    const sleeve = new THREE.MeshStandardMaterial({color: '#424944', roughness: .95});
    const sphere = (parent, material, x, y, z, sx, sy, sz) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
    };
    const finger = (parent, points, radius) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => point(...p)));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius, 7, false), glove); parent.add(mesh);
    };
    const rod = (top, bottom, material) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, 1, 12), material); this.root.add(mesh); return mesh; };
    this.arms = [];
    for (const side of [-1, 1]) {
      const hand = new THREE.Group(); hand.position.set(side * COCKPIT.radius, .01, .022); this.grips.add(hand);
      sphere(hand, glove, side * .009, -.008, .030, .036, .063, .022);
      sphere(hand, patch, side * .014, .002, .051, .025, .035, .003);
      for (let i = 0; i < 4; i++) {
        const y = .034 - i * .02;
        finger(hand, [[side*.03,y,.034],[-side*.003,y+.003,.045],[-side*.027,y,.024],[-side*.027,y-.003,-.009],[-side*.005,y-.005,-.022]], i === 3 ? .007 : .0085);
      }
      finger(hand, [[side*.025,-.04,.037],[-side*.007,-.027,.060],[-side*.029,-.007,.042],[-side*.031,.003,.018]], .011);
      const pieces=hand.children.filter(mesh=>mesh.material===glove),geometries=pieces.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
      const skin=new THREE.Mesh(mergeGeometries(geometries),glove);
      for(const mesh of pieces){hand.remove(mesh);mesh.geometry.dispose();}geometries.forEach(geometry=>geometry.dispose());hand.add(skin);
      const forearm = rod(.027,.044,sleeve), upper = rod(.044,.064,sleeve), cuff = rod(.029,.031,patch);
      const elbow = sphere(this.root, sleeve, 0, 0, 0, .045,.05,.045);
      this.arms.push({side,forearm,upper,cuff,elbow});
    }
    this.root.traverse(node => { if (node.isMesh) {node.castShadow = false; node.receiveShadow = true;} });
    this.visualSteering = 0;
  }
  update(input, dt) {
    this.visualSteering += (input - this.visualSteering) * (1 - Math.exp(-Math.max(0,dt) / .045));
    this.grips.rotation.z = cockpitWheelAngle(this.visualSteering);
    for (const arm of this.arms) {
      const p = cockpitWrist(arm.side, this.visualSteering), wrist = point(p.x,p.y,p.z);
      const shoulder = point(arm.side*.29,-.84,.03), elbow = point(arm.side*.31+p.x*.16,-.63+Math.min(0,p.y+.3)*.22,-.44);
      connect(arm.forearm,elbow,wrist); connect(arm.upper,shoulder,elbow); arm.elbow.position.copy(elbow);
      connect(arm.cuff,wrist.clone().addScaledVector(elbow.clone().sub(wrist).normalize(),.045),wrist);
    }
  }
}
