import { BlobWriter, ZipWriter, TextReader, BlobReader } from '@zip.js/zip.js';
import { cloudApi, cloud } from './api';
import { t } from '../preferences.svelte';
export async function createBackup(progress: (text: string) => void = () => {}) {
  progress(t('Taking a collection snapshot…', 'Mengambil salinan data…'));
  const data = await cloudApi('/backup');
  const media = [...new Map<string, any>(data.rows.media.map((m: any) => [m.disk, m])).values()];
  if (media.reduce((n, m) => n + m.bytes, 0) > 450_000_000)
    throw Error(
      t(
        'Browser backups are limited to 450 MB of media. Use database and Storage backup tools for larger collections.',
        'Backup browser dibatasi 450 MB media. Gunakan backup database dan Storage melalui dashboard untuk koleksi yang lebih besar.',
      ),
    );
  const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
  try {
    const metadata = JSON.stringify(data);
    if (new TextEncoder().encode(metadata).length > 64 * 1024 ** 2)
      throw Error(
        t(
          'Backup metadata exceeds the browser restore limit of 64 MB.',
          'Metadata backup melebihi batas pemulihan browser 64 MB.',
        ),
      );
    await zip.add('backup.json', new TextReader(metadata));
    for (let i = 0; i < media.length; i += 4) {
      const blobs = await Promise.all(
        media.slice(i, i + 4).map(async (m) => {
          const { data, error } = await cloud!.storage.from('myanki-media').download(m.disk);
          if (error) throw error;
          return { disk: m.disk, data: data! };
        }),
      );
      for (const m of blobs) await zip.add('media/' + m.disk, new BlobReader(m.data), { level: 0 });
      progress(
        t(
          `Downloading media ${Math.min(i + 4, media.length)}/${media.length}…`,
          `Mengunduh media ${Math.min(i + 4, media.length)}/${media.length}…`,
        ),
      );
    }
    const blob = await zip.close();
    return blob;
  } catch (e) {
    try {
      await zip.close();
    } catch {}
    throw e;
  }
}
