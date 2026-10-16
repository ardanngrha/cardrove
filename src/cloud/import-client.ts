import { cloud, cloudApi } from './api';
import { t } from '../preferences.svelte';
export async function importDeck(file: File, onProgress: (message: string) => void = () => {}) {
  const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  let id = '',
    summary: any,
    uploaded = 0,
    total = 0;
  let stopped = false;
  const existing = new Set<string>();
  return new Promise<any>((resolve, reject) => {
    const fail = (e: unknown) => {
      if (stopped) return;
      stopped = true;
      worker.terminate();
      reject(e instanceof Error ? e : Error(String(e)));
    };
    worker.onerror = (e) => fail(Error(e.message));
    worker.onmessage = async ({ data }) => {
      if (stopped) return;
      try {
        if (data.type === 'progress') {
          onProgress(
            data.stage === 'package'
              ? t('Checking package…', 'Memeriksa paket…')
              : data.stage === 'backup'
                ? t(
                    `Checking backup ${data.current}/${data.total}…`,
                    `Memeriksa backup ${data.current}/${data.total}…`,
                  )
                : t(
                    `Checking media ${data.current}/${data.total}…`,
                    `Memeriksa media ${data.current}/${data.total}…`,
                  ),
          );
        }
        if (data.type === 'error') return fail(Error(data.message));
        if (data.type === 'ready') {
          summary = data.summary;
          total = data.manifest.length;
          const started = await cloudApi('/import/begin', {
            method: 'POST',
            body: JSON.stringify({
              hash: data.hash,
              name: data.name,
              manifest: data.manifest,
              summary,
              backup: data.backup,
            }),
          });
          if (started.duplicate) {
            stopped = true;
            worker.terminate();
            resolve(started);
            return;
          }
          id = started.id;
          for (const path of started.existing ?? []) existing.add(path);
          for (const [kind, rows] of Object.entries(data.rows) as [string, any[]][]) {
            let part = 0,
              batch: any[] = [],
              size = 0;
            for (const row of rows) {
              const len = JSON.stringify(row).length;
              if (len > 1_000_000)
                throw Error(t('One note exceeds the size limit.', 'Satu catatan terlalu besar.'));
              if (batch.length >= 100 || size + len > 1_000_000) {
                await cloudApi(`/import/${id}/chunk`, {
                  method: 'POST',
                  body: JSON.stringify({ kind, part: part++, data: batch }),
                });
                batch = [];
                size = 0;
              }
              batch.push(row);
              size += len;
            }
            if (batch.length)
              await cloudApi(`/import/${id}/chunk`, {
                method: 'POST',
                body: JSON.stringify({ kind, part, data: batch }),
              });
          }
          onProgress(t('Uploading media…', 'Mengunggah media…'));
          worker.postMessage({ type: 'continue' });
        }
        if (data.type === 'media') {
          if (!existing.has(data.disk)) {
            const uploaded = await cloud!.storage
              .from('myanki-media')
              .upload(data.disk, new Blob([data.bytes], { type: data.mime }), {
                contentType: data.mime,
                cacheControl: '86400',
                upsert: false,
              });
            if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message))
              throw uploaded.error;
          }
          uploaded++;
          onProgress(
            t(`Saving media ${uploaded}/${total}…`, `Menyimpan media ${uploaded}/${total}…`),
          );
          worker.postMessage({ type: 'ack', id: data.id });
        }
        if (data.type === 'done') {
          onProgress(t('Verifying your deck…', 'Memeriksa kelengkapan deck…'));
          const result = await cloudApi(`/import/${id}/finish`, { method: 'POST', body: '{}' });
          stopped = true;
          worker.terminate();
          resolve(result);
        }
      } catch (e) {
        fail(e);
      }
    };
    worker.postMessage({ type: 'parse', file });
  });
}
