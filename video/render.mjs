import { bundle } from '@remotion/bundler';
import {
  ensureBrowser,
  selectComposition,
  renderMedia,
  renderStill,
  getVideoMetadata,
} from '@remotion/renderer';
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, '../site/public/media');
const proofs = resolve(root, '../work/video-render');
await mkdir(output, { recursive: true });
await mkdir(proofs, { recursive: true });
await ensureBrowser({ logLevel: 'info' });
const serveUrl = await bundle({
  entryPoint: resolve(root, 'src/index.jsx'),
  publicDir: resolve(root, 'public'),
});
const onBrowserLog = ({ type, text }) => {
  if (type === 'error' || type === 'warning') console.error(`Video ${type}: ${text}`);
};
const composition = await selectComposition({ serveUrl, id: 'CardroveTour', onBrowserLog });
const poster = await selectComposition({ serveUrl, id: 'CardrovePoster', onBrowserLog });
const posterPng = resolve(proofs, 'poster.png');
await renderStill({ serveUrl, composition: poster, output: posterPng, imageFormat: 'png' });
await sharp(posterPng)
  .resize(1440)
  .webp({ quality: 85 })
  .toFile(resolve(output, 'cardrove-tour-poster.webp'));
await sharp(posterPng)
  .resize(1200, 675)
  .webp({ quality: 85 })
  .toFile(resolve(proofs, 'cardrove-project.webp'));
if (process.argv.includes('--stills')) {
  for (const frame of [0, 70, 155, 265, 350, 465, 690, 920, 1140, 1199])
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: resolve(proofs, `frame-${frame}.png`),
      imageFormat: 'png',
    });
  console.log('Representative frames and poster rendered in work/video-render/.');
} else {
  let last = -1;
  const file = resolve(output, 'cardrove-tour.mp4');
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    crf: 21,
    pixelFormat: 'yuv420p',
    concurrency: 2,
    outputLocation: file,
    metadata: {
      title: 'Cardrove: A little, remembered.',
      comment: 'Original sample collection. No personal collection or credentials are shown.',
    },
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) {
        last = p;
        console.log(`Rendering ${p * 10}%`);
      }
    },
  });
  const metadata = await getVideoMetadata(file);
  console.log(
    JSON.stringify({
      duration: metadata.durationInSeconds,
      width: metadata.width,
      height: metadata.height,
      bytes: (await stat(file)).size,
    }),
  );
}
