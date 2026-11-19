import {defineConfig} from 'vite';
export default defineConfig({
  root:'src/game',base:'/game/',publicDir:false,
  build:{
    outDir:'../../public/game',emptyOutDir:true,target:'es2022',sourcemap:true,chunkSizeWarningLimit:700,
    rolldownOptions:{output:{codeSplitting:{groups:[{
      debugName:'three-runtime',name:id=>id.includes('/three/build/')?'three-core':id.includes('/three/examples/')?'three-extras':null,
      test:/node_modules\/three\//
    }]}}}
  }
});
