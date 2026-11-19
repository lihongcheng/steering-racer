import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as THREE from 'three';

// Decode the shipped mesh in Node to test actual cockpit occlusion, without WebGL mocks.
export async function loadCarFixture(){
  const root=new URL('../',import.meta.url),decoderRoot=new URL('node_modules/three/examples/jsm/libs/draco/gltf/',root);
  const sandbox={module:{exports:{}},exports:{},require:createRequire(import.meta.url),console,process,Buffer,setTimeout,clearTimeout,WebAssembly,TextDecoder,__dirname:process.cwd()};
  vm.runInNewContext(await readFile(new URL('draco_wasm_wrapper.js',decoderRoot),'utf8'),sandbox);
  const draco=await sandbox.module.exports({wasmBinary:await readFile(new URL('draco_decoder.wasm',decoderRoot))});
  const bytes=await readFile(new URL('assets/runtime/ferrari.glb',root)),jsonSize=bytes.readUInt32LE(12);
  const data=JSON.parse(bytes.subarray(20,20+jsonSize)),binary=bytes.subarray(28+jsonSize);
  const materials=data.materials.map(m=>new THREE.MeshStandardMaterial({name:m.name}));
  const meshes=data.meshes.map(definition=>definition.primitives.map(primitive=>{
    const extension=primitive.extensions.KHR_draco_mesh_compression,view=data.bufferViews[extension.bufferView];
    const input=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    const decoder=new draco.Decoder(),buffer=new draco.DecoderBuffer(),mesh=new draco.Mesh();buffer.Init(new Int8Array(input),input.length);
    const status=decoder.DecodeBufferToMesh(buffer,mesh);if(!status.ok())throw new Error(status.error_msg());
    const geometry=new THREE.BufferGeometry();
    for(const [semantic,name] of [['POSITION','position'],['NORMAL','normal']]){
      const attribute=decoder.GetAttributeByUniqueId(mesh,extension.attributes[semantic]),values=new draco.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(mesh,attribute,values);
      const output=new Float32Array(mesh.num_points()*3);for(let i=0;i<output.length;i++)output[i]=values.GetValue(i);
      geometry.setAttribute(name,new THREE.BufferAttribute(output,3));draco.destroy(values);
    }
    const face=new draco.DracoInt32Array(),indices=new Uint32Array(mesh.num_faces()*3);
    for(let i=0;i<mesh.num_faces();i++){decoder.GetFaceFromMesh(mesh,i,face);for(let j=0;j<3;j++)indices[i*3+j]=face.GetValue(j);}
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
    for(const value of [face,mesh,buffer,decoder])draco.destroy(value);
    return {geometry,material:materials[primitive.material]};
  }));
  const nodes=data.nodes.map(node=>{
    const primitive=meshes[node.mesh]?.[0],object=primitive?new THREE.Mesh(primitive.geometry,primitive.material):new THREE.Group();
    object.name=node.name;object.position.fromArray(node.translation||[0,0,0]);object.quaternion.fromArray(node.rotation||[0,0,0,1]);object.scale.fromArray(node.scale||[1,1,1]);return object;
  });
  data.nodes.forEach((node,i)=>(node.children||[]).forEach(j=>nodes[i].add(nodes[j])));
  const model=new THREE.Group();data.scenes[0].nodes.forEach(i=>model.add(nodes[i]));return model;
}
