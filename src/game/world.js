import * as THREE from 'three';
import {disposeAssets} from './assets/load-assets.js';
import {createRenderer} from './rendering/renderer.js';
import {AfternoonLighting} from './rendering/lighting.js';
import {createPostprocessing} from './rendering/postprocessing.js';
import {QUALITY,normalizeQuality} from './rendering/quality.js';
import {CameraRig} from './rendering/camera-rig.js';
import {StreetReflections} from './rendering/reflections.js';
import {RearMirror} from './rendering/rear-mirror.js';
import {cityMaterials} from './city/materials.js';
import {createRoad} from './city/road.js';
import {createDistrictLayout} from './city/districts.js';
import {createBuildings,createDistantCity} from './city/buildings.js';
import {createProps} from './city/props.js';
import {Vegetation} from './city/vegetation.js';
import {Vehicle} from './vehicle/vehicle.js';
import {Driver} from './vehicle/driver.js';
import {Dashboard} from './vehicle/dashboard.js';
import {RenderStats} from './debug/render-stats.js';

export class World {
  constructor(canvas,assets,qualityName='medium') {
    this.assets=assets;this.qualityName=normalizeQuality(qualityName);this.quality=QUALITY[this.qualityName];
    this.renderer=createRenderer(canvas,this.quality);this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(55,1,.08,750);this.cameraRig=new CameraRig(this.camera);
    this.lighting=new AfternoonLighting(this.scene,this.renderer,assets,this.quality);
    const materials=cityMaterials(assets,this.renderer);this.materials=materials;
    materials.districtGlass={boulevard:materials.glass,oldtown:materials.glass.clone(),works:materials.glass.clone()};
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),new THREE.MeshStandardMaterial({color:'#899078',roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;this.scene.add(ground);
    createRoad(this.scene,materials);
    this.lots=createDistrictLayout();this.city=createBuildings(this.scene,this.lots,materials);createDistantCity(this.scene,materials);
    this.vegetation=new Vegetation(this.scene,assets,materials);
    this.vehicle=new Vehicle(assets.car);this.scene.add(this.vehicle.root);
    this.driver=new Driver(this.vehicle.body);this.dashboard=new Dashboard(this.vehicle.body);
    this.props=createProps(this.scene,materials,this.vehicle.parkedModel);
    this.rearMirror=new RearMirror(this.renderer,this.scene,this.vehicle,this.qualityName!=='low');
    this.scene.updateMatrixWorld(true);
    this.reflections=new StreetReflections(this.renderer,this.scene,this.vehicle,this.quality,this.lighting);
    ['boulevard','oldtown','works'].forEach((district,index)=>{const glass=materials.districtGlass[district];glass.envMap=this.reflections.probes[index].target.texture;glass.envMapIntensity=.45;glass.needsUpdate=true;});
    this.composer=createPostprocessing(this.renderer,this.scene,this.camera,this.quality);
    this.stats=new RenderStats();this.resizeHandler=()=>this.resize();window.addEventListener('resize',this.resizeHandler);this.resize();
  }
  resize(){
    const canvas=this.renderer.domElement,w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
    const pixelBudget=this.qualityName==='high'?3600000:this.qualityName==='low'?1200000:2100000;
    const ratio=Math.min(devicePixelRatio,this.quality.pixelRatio,Math.sqrt(pixelBudget/(w*h)));
    this.renderer.setPixelRatio(ratio);this.composer.setPixelRatio(ratio);
    this.renderer.setSize(w,h,false);this.composer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  render(state,{phase,brake=0,dt=1/60,time=0,camera='chase',visualSteering=state.steering,seatHeight}={}){
    this.renderer.info.reset();
    this.vehicle.update(state,{dt,phase,brake,visualSteering});
    this.lighting.update(this.vehicle.root.position);
    const mode=this.cameraRig.update(state,{phase,mode:camera,dt,time,seatHeight},this.vehicle,this.lots);
    this.vehicle.setCamera(mode);this.driver.root.visible=mode==='cockpit';this.dashboard.screen.visible=mode==='cockpit';
    if(mode==='cockpit'){this.driver.update(visualSteering,dt);this.dashboard.update(state,time);}
    this.vegetation.update(time,this.camera,this.quality.treeDistance);this.props.update(this.camera);this.reflections.update(this.vehicle.root.position);
    this.rearMirror.update(time,mode);this.composer.render();this.lastStats=this.stats.frame(performance.now(),this.renderer);
  }
  dispose(){
    window.removeEventListener('resize',this.resizeHandler);this.composer.dispose();this.reflections.dispose();this.rearMirror.dispose();this.lighting.dispose();this.vegetation.dispose();this.dashboard.dispose();
    const geometries=new Set(),materials=new Set(),textures=new Set(Object.values(this.assets).filter(value=>value?.isTexture));
    this.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
    disposeAssets(this.assets);this.renderer.dispose();
  }
}
