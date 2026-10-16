<script lang="ts">
  import { onMount } from 'svelte';
  import { t, locale, number } from '../preferences.svelte';
  let {
    api,
    currentId,
  }: { api: (route: string, options?: RequestInit) => Promise<any>; currentId: string } = $props();
  let devices = $state<any[]>([]),
    jobs = $state<any[]>([]),
    usage = $state<any>(null),
    loading = $state(true);
  let backupProgress = $state(''),
    restoreFile = $state<File | null>(null);
  let busy = $state(false),
    error = $state(''),
    token = $state(''),
    qr = $state(''),
    expires = $state(''),
    copied = $state(false);
  let now = $state(Date.now()),
    revokeId = $state('');
  const secondsLeft = $derived(Math.max(0, Math.ceil((Date.parse(expires) - now) / 1000)));
  $effect(() => {
    if (!token || secondsLeft <= 0) return;
    const timer = setTimeout(() => (now = Date.now()), 1000);
    return () => clearTimeout(timer);
  });
  async function refresh() {
    [devices, jobs, usage] = await Promise.all([api('/devices'), api('/imports'), api('/usage')]);
  }
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
      backupProgress = '';
    } finally {
      busy = false;
    }
  }
  async function pair() {
    await act(async () => {
      const { default: QRCode } = await import('qrcode');
      const data = await api('/pair-token', { method: 'POST' });
      token = data.token;
      expires = data.expires;
      copied = false;
      now = Date.now();
      qr = await QRCode.toDataURL(location.origin + location.pathname + '#connect=' + token, {
        width: 220,
        margin: 2,
        color: { dark: '#2c2b27', light: '#ffffff' },
      });
    });
  }
  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function archive() {
    await act(async () =>
      download(
        new Blob([JSON.stringify(await api('/export'))], { type: 'application/json' }),
        'myanki-progress-' + new Date().toISOString().slice(0, 10) + '.json',
      ),
    );
  }
  async function backup() {
    await act(async () => {
      const { createBackup } = await import('./backup');
      const blob = await createBackup((text) => (backupProgress = text));
      download(blob, 'myanki-' + new Date().toISOString().slice(0, 10) + '.myanki.zip');
      backupProgress = t('Full backup downloaded.', 'Backup lengkap selesai diunduh.');
    });
  }
  async function restore() {
    if (!restoreFile) return;
    await act(async () => {
      const { importDeck } = await import('./import-client');
      await importDeck(restoreFile!, (text) => (backupProgress = text));
      backupProgress = t(
        'Backup restored. Reload the page to continue.',
        'Backup dipulihkan. Muat ulang halaman untuk melanjutkan.',
      );
      await refresh();
    });
  }
  onMount(() => {
    refresh()
      .catch((e) => (error = e.message))
      .finally(() => (loading = false));
  });
</script>

<section class="settings-panel">
  <h2>{t('Your devices', 'Perangkatmu')}</h2>
  <p>
    {t(
      'These devices share your collection and review progress.',
      'Perangkat ini memakai koleksi dan progress yang sama.',
    )}
  </p>
  {#if loading}<p role="status">
      {t('Opening your device list…', 'Membuka daftar perangkat…')}
    </p>{:else if !devices.length}<p>
      {t('No devices to show.', 'Tidak ada perangkat untuk ditampilkan.')}
    </p>{/if}
  {#each devices.filter((device) => !device.revoked_at) as device}
    <div class="device-row">
      <div>
        <strong dir="auto">{device.name}</strong><small
          >{device.id === currentId
            ? t('This device', 'Perangkat ini')
            : new Date(device.created_at).toLocaleDateString(locale())}</small
        >
      </div>
      {#if device.id !== currentId}<button
          class="button secondary"
          disabled={busy}
          onclick={() => (revokeId = device.id)}>{t('Revoke access', 'Cabut akses')}</button
        >{/if}
    </div>
    {#if revokeId === device.id}<div
        class="revoke-check"
        role="group"
        aria-label={t('Confirm device revocation', 'Konfirmasi pencabutan perangkat')}
      >
        <p>
          {t(
            'Disconnect this device? It will need a new connection code to return.',
            'Putuskan perangkat ini? Perlu kode penghubung baru untuk kembali.',
          )}
        </p>
        <div class="inline-actions">
          <button class="button secondary" disabled={busy} onclick={() => (revokeId = '')}
            >{t('Keep connected', 'Tetap hubungkan')}</button
          ><button
            class="button primary"
            disabled={busy}
            onclick={() =>
              act(async () => {
                await api('/devices/' + device.id, { method: 'DELETE' });
                revokeId = '';
                await refresh();
              })}>{t('Disconnect device', 'Putuskan perangkat')}</button
          >
        </div>
      </div>{/if}
  {/each}
  <button class="button secondary" disabled={busy || loading} onclick={pair}
    >{t('Connect a new device', 'Hubungkan perangkat baru')}</button
  >
  {#if token}<div class="pair-box">
      {#if secondsLeft > 0}<img
          src={qr}
          alt={t('Device connection QR code', 'QR penghubung perangkat')}
          width="220"
          height="220"
        />
        <p>
          {t(
            'Scan this on your phone, or paste the code on your other device. Single-use.',
            'Pindai dari HP, atau tempel kode ini pada perangkat lain. Berlaku sekali.',
          )}
        </p>
        <p class="expiry">
          {t('Expires in', 'Kedaluwarsa dalam')}
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </p>
        <input aria-label={t('Connection code', 'Kode penghubung')} readonly value={token} /><button
          class="button secondary"
          disabled={busy}
          onclick={() =>
            act(async () => {
              await navigator.clipboard.writeText(token);
              copied = true;
            })}>{copied ? t('Copied', 'Tersalin') : t('Copy code', 'Salin kode')}</button
        >{:else}<p role="status">
          {t(
            'This connection code has expired. Create a new code to continue.',
            'Kode penghubung ini sudah kedaluwarsa. Buat kode baru untuk melanjutkan.',
          )}
        </p>
        <button class="button secondary" disabled={busy} onclick={pair}
          >{t('Create a fresh code', 'Buat kode baru')}</button
        >{/if}
    </div>{/if}
  <p class="fine-print">
    {t(
      'Revoking access blocks new requests. Downloaded media remains on the device, and existing media links can remain valid for up to 10 minutes.',
      'Pencabutan akses menghentikan permintaan baru. Media yang sudah diunduh tetap ada di perangkat, dan tautan media bisa tetap berlaku hingga 10 menit.',
    )}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>
    <button
      class="text-button"
      disabled={busy}
      onclick={() =>
        act(async () => {
          await refresh();
          loading = false;
        })}>{t('Reload device settings', 'Muat ulang pengaturan perangkat')}</button
    >{/if}
</section>
<section class="settings-panel">
  <h2>{t('Storage & backups', 'Penyimpanan dan backup')}</h2>
  {#if usage}<p>
      {(usage.bytes / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB / {(
        usage.limit / 1e6
      ).toLocaleString(locale(), { maximumFractionDigits: 0 })} MB {t(
        'application limit',
        'batas aplikasi',
      )} · {number(usage.files)}
      {t('media files', 'file media')}
    </p>{/if}
  {#each jobs as job}<div class="device-row">
      <div>
        <strong dir="auto">{job.name}</strong><small
          >{t(
            'Unfinished import. Choose the same file in Import deck to resume.',
            'Impor belum selesai. Pilih file yang sama di Impor deck untuk melanjutkan.',
          )}</small
        >
      </div>
      <button
        class="button secondary"
        disabled={busy}
        onclick={() =>
          act(async () => {
            await api('/import/' + job.id, { method: 'DELETE' });
            await refresh();
          })}>{t('Cancel import', 'Batalkan impor')}</button
      >
    </div>{/each}
  <button class="button secondary" disabled={busy || loading} onclick={backup}
    >{t('Download full backup', 'Unduh backup lengkap')}</button
  ><button class="button secondary" disabled={busy || loading} onclick={archive}
    >{t('Export progress archive', 'Unduh arsip progress')}</button
  >
  <p class="fine-print">
    {t(
      'A full backup includes decks, media, preferences, and progress. Restore it into an empty installation, then reconnect your devices. Transfers require a connection and use your hosting quota. Browser backup limit: 450 MB of media.',
      'Backup lengkap berisi deck, media, pengaturan, dan progress. Pulihkan di instalasi kosong, lalu hubungkan ulang perangkatmu. Transfer memerlukan koneksi dan memakai kuota hosting. Batas backup browser: 450 MB media.',
    )}
  </p>
  <label
    >{t('Restore a backup', 'Pulihkan backup')}<input
      type="file"
      accept=".myanki.zip"
      disabled={busy}
      onchange={(event) => (restoreFile = event.currentTarget.files?.[0] || null)}
    /></label
  ><button class="button secondary" disabled={busy || !restoreFile} onclick={restore}
    >{t('Restore into empty installation', 'Pulihkan ke instalasi kosong')}</button
  >
  {#if backupProgress}<p class="fine-print" role="status">{backupProgress}</p>{/if}
</section>

<style>
  .device-row {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 16px;
    padding: 18px 0;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
  }
  .device-row strong {
    font-size: 14px;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  .device-row small {
    display: block;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.6;
    margin-top: 7px;
  }
  .pair-box {
    margin-top: 20px;
    padding: 24px;
    background: var(--soft);
    border: 1px solid var(--line);
    border-radius: 6px;
    max-width: 450px;
  }
  .pair-box img {
    display: block;
    margin: 0 auto 24px;
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }
  .pair-box input {
    font-family: monospace;
    margin: 8px 0 14px;
    font-size: 12px;
  }
  .pair-box p {
    font-size: 14px;
    margin-bottom: 14px;
  }
  .expiry {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .revoke-check {
    border-left: 2px solid var(--accent);
    padding: 5px 0 10px 20px;
    margin-bottom: 25px;
  }
  .revoke-check p {
    color: var(--muted);
    font-size: 14px;
  }
  .revoke-check .inline-actions {
    justify-content: start;
    margin-top: 15px;
  }
  @media (min-width: 740px) {
    .device-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
    .device-row > div {
      min-width: 0;
    }
    .device-row > button {
      flex-shrink: 0;
    }
  }
</style>
