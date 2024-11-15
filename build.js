const { build } = require('esbuild');
const fs = require('fs');

async function bundlePlugin(){
    const result = await build({
        entryPoints: ['src/index.ts'],
        outfile: 'dist/kasuga_object.js',
        format: 'cjs',
        external: ['blockbench-types', 'three'],
        platform: 'browser',
        bundle: true,
        write: false,
        sourcemap: false,
    })
    
    // Append wrapper
    const wrapper = `(function(){
const require = (path) => {
    switch(path){
        case 'blockbench-types': return {};
        case 'three': return THREE;
    }
    throw new Error(\`Unknown module \${path}\`);
}
${result.outputFiles[0].text}
})();
    `
    fs.writeFileSync('dist/kasuga_object.js', wrapper);
}


bundlePlugin();