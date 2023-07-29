import * as esbuild from 'esbuild'

const args = process.argv.slice(2);

async function go() {
  const common = {
    bundle: true,
    sourcemap: true,
 	 logLevel: 'info',
  };
  await esbuild.build({
    ...common,
    entryPoints: ['./src/index.ts'],
    outfile: './out/index.js',
    platform: 'node',
    external: ['emitter'],
  });

  const webOpts = {
    ...common,
    entryPoints: ['./src/logger.ts'],
    outfile: './out/logger.js',
  };

  if (args[0] == 'watch') {
    const ctx = await esbuild.context(webOpts);
    await ctx.watch();
  }
  else {
    await esbuild.build(webOpts);
  }


}

go();



// const { build } = require('esbuild')


// async function go() {

//   await build({
// 	 entryPoints: ['./src/index.ts'],
// 	 minify: false,
// 	 sourcemap: true,
// 	 bundle: true,
// 	 outdir: './out',
// 	 format: 'cjs',
// 	 logLevel: 'info',
// 	 watch: args[0] == 'watch',
// 	 platform: 'node',
//   });
// }

// go();
