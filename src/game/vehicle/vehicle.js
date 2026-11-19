import * as THREE from 'three';
import {vehiclePose, VEHICLE} from './vehicle-pose.js';
import {cockpitWheelAngle} from '../../../shared/camera.js';
import {fitInterior} from './interior-fit.js';

export class Vehicle {
  constructor(model) {
    this.root = new THREE.Group(); this.root.name = 'player-vehicle';
    this.body = new THREE.Group(); this.root.add(this.body);
    this.model = model; this.model.rotation.y = Math.PI; this.body.add(model);
    this.fittedInterior=fitInterior(model);
    this.paint = new THREE.MeshPhysicalMaterial({color: '#94130e', metalness: .3, roughness: .28, clearcoat: 1, clearcoatRoughness: .075, envMapIntensity: .55, vertexColors:true});
    this.glass = new THREE.MeshPhysicalMaterial({color: '#c4d6dc', metalness: .1, roughness: .06, clearcoat: 1,
      transparent: true, opacity: .22, depthWrite: false, envMapIntensity: 1.1});
    this.brake = new THREE.MeshStandardMaterial({color: '#74170c', emissive: '#ed2111', emissiveIntensity: .45, roughness: .3});
    const metal = new THREE.MeshStandardMaterial({color: '#9a9b9d', metalness: .92, roughness: .25});
    const rubber = new THREE.MeshStandardMaterial({color: '#1c1c1d', roughness: .96});
    const leather = new THREE.MeshStandardMaterial({color: '#2d2522', roughness: .84});
    const trim = new THREE.MeshStandardMaterial({color: '#31363a', metalness: .55, roughness: .42});
    this.model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true; node.receiveShadow = true;
      const name = node.name;
      if (name === 'body') node.material = this.paint;
      else if (name === 'glass') { node.material = this.glass; node.castShadow = false; this.windows = node; }
      else if (name === 'lights_red' || name === 'brakes') node.material = this.brake;
      else if (/rim|chrome|^wheel$|^metal$|^brake/.test(name)) node.material = metal;
      else if (/tire|grills|wipers/.test(name)) node.material = rubber;
      else if (/leather|carpet/.test(name)) node.material = leather;
      else if (/carbon/.test(name)) node.material = trim;
      else if (/plastic|interior/.test(name)) node.material = new THREE.MeshStandardMaterial({color: name==='interior_dark'?'#4c4741':'#20272b',roughness:.82,metalness:0});
      else if (name === 'trim') node.material = new THREE.MeshStandardMaterial({color: '#8b4031', roughness: .75});
      else if (name === 'lights' || name === 'leds') {
        node.material = new THREE.MeshStandardMaterial({color: '#e5e6dc', emissive: '#fff9dc', emissiveIntensity: .32, roughness: .15});
        node.castShadow = false;
      }
      if (node.material.transparent) node.material.depthWrite = false;
    });
    this.parkedModel=model.clone(true);
    this.wheels = ['fl', 'fr', 'rl', 'rr'].map((name,index) => {
      const wheel = model.getObjectByName(`wheel_${name}`);
      if (!wheel) throw new Error(`车模缺少轮组 ${name}`);
      const parent = wheel.parent, pivot = new THREE.Group(); pivot.position.copy(wheel.position);
      parent.add(pivot); wheel.position.set(0, 0, 0); pivot.add(wheel);
      return {pivot, wheel, base: wheel.quaternion.clone(), front: name.startsWith('f'),support:[3,2,1,0][index]};
    });
    this.wheelGroup=new THREE.Group();this.root.add(this.wheelGroup);this.root.updateMatrixWorld(true);
    for(const wheel of this.wheels){this.wheelGroup.attach(wheel.pivot);wheel.pivotBase=wheel.pivot.quaternion.clone();wheel.height=wheel.pivot.position.y;}
    this.steering = model.getObjectByName('steering_wheel');
    this.steeringBase = this.steering?.quaternion.clone();
    this.previousSpeed = 0; this.spin = 0; this.lastPosition = null;
    this.eye = new THREE.Vector3(VEHICLE.eyeX, VEHICLE.eyeY, VEHICLE.eyeZ);
    this.axis = new THREE.Vector3(1, 0, 0); this.rotation = new THREE.Quaternion();
  }
  update(state, {dt, phase, brake = 0, visualSteering = state.steering}) {
    const teleport = this.lastPosition && Math.hypot(state.x - this.lastPosition.x, state.z - this.lastPosition.z) > 4;
    if (teleport || phase !== 'running') this.previousSpeed = state.speed;
    const pose = vehiclePose(state, this.previousSpeed, dt);
    this.root.position.set(state.x, pose.height, state.z); this.root.rotation.y = state.heading;
    const factor = 1 - Math.exp(-Math.max(0, dt) * 10);
    this.body.rotation.x += (pose.pitch - this.body.rotation.x) * factor;
    this.body.rotation.z += (pose.roll - this.body.rotation.z) * factor;
    if (phase === 'running' && !teleport) this.spin = (this.spin + pose.spin) % (Math.PI * 2);
    for (const {pivot, wheel, base, front, pivotBase, height, support} of this.wheels) {
      pivot.quaternion.copy(pivotBase).multiply(this.rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),front?state.wheelAngle:0));
      pivot.position.y=height+pose.supports[support]-pose.height;
      wheel.quaternion.copy(base).premultiply(this.rotation.setFromAxisAngle(this.axis, -this.spin));
    }
    if (this.steering) this.steering.quaternion.copy(this.steeringBase).multiply(this.rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -cockpitWheelAngle(visualSteering)));
    this.brake.emissiveIntensity = brake > .05 ? 2.8 : .35;
    this.previousSpeed = state.speed; this.lastPosition = {x: state.x, z: state.z};
  }
  setCamera(mode) {
    this.root.visible = mode !== 'bumper';
    if (this.windows) this.windows.visible = mode !== 'cockpit' && mode !== 'hood';
  }
}
