<script lang="ts">
  import { t } from './preferences.svelte';
  let {
    user,
    api,
    onboarding = false,
    onupdated,
    onpending,
  }: {
    user: { name: string; workspaceName?: string };
    api: (route: string, options?: RequestInit) => Promise<any>;
    onboarding?: boolean;
    onupdated: (reset?: boolean) => Promise<void>;
    onpending?: (pending: boolean) => void;
  } = $props();
  let owner = $state(''),
    workspaceName = $state('');
  let dirty = $state(false);
  let token = $state(''),
    saved = $state(false),
    copied = $state(false);
  let rotateConfirm = $state(''),
    resetConfirm = $state('');
  let busy = $state(false),
    error = $state(''),
    message = $state('');
  $effect(() => {
    if (!token && !dirty) {
      owner = user.name;
      workspaceName = user.workspaceName || 'Cardrove';
    }
  });
  $effect(() => {
    onpending?.(!!token);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    if (token) window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      onpending?.(false);
    };
  });
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    message = '';
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  const post = (route: string, body: unknown) =>
    api(route, { method: 'POST', body: JSON.stringify(body) });
  async function saveProfile() {
    await act(async () => {
      if (onboarding) {
        token = (await post('/workspace/setup', { name: owner, workspaceName })).token;
        saved = false;
        copied = false;
      } else {
        await api('/workspace', {
          method: 'PATCH',
          body: JSON.stringify({ name: owner, workspaceName }),
        });
        await onupdated();
        dirty = false;
        message = t('Workspace names saved.', 'Nama workspace tersimpan.');
      }
    });
  }
  async function confirmSaved() {
    if (!saved) return;
    await act(async () => {
      await post('/workspace/confirm-access', { token });
      await onupdated();
      token = '';
      saved = false;
      message = t(
        'Access code saved. Keep your copy private.',
        'Kode akses tersimpan. Jaga salinanmu tetap privat.',
      );
    });
  }
  function downloadCode() {
    const content = `Cardrove access code\n\nYour name: ${owner}\nWorkspace: ${workspaceName}\nApp: ${location.origin}\n\n${token}\n\nKeep this file private. This code grants access to your collection and can be reused until rotated in Settings.\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cardrove-access-code.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<section class="settings-panel workspace-profile">
  <svelte:element this={onboarding ? 'h1' : 'h2'}>
    {onboarding
      ? t('Make this space yours.', 'Beri nama ruang belajarmu.')
      : t('Your workspace', 'Workspace-mu')}
  </svelte:element>
  {#if !token}
    <p>
      {onboarding
        ? t(
            'Enter your name and a workspace name. Next, save the private access code for your other devices.',
            'Masukkan namamu dan nama workspace. Setelah itu, simpan kode akses privat untuk perangkat lain.',
          )
        : t(
            'These names appear across your connected devices.',
            'Nama ini ditampilkan di perangkat yang terhubung.',
          )}
    </p>
    <form
      class="settings-form"
      onsubmit={(e) => {
        e.preventDefault();
        void saveProfile();
      }}
    >
      <label
        >{t('Your name', 'Namamu')}<input
          required
          maxlength="64"
          bind:value={owner}
          autocomplete="name"
          oninput={() => (dirty = true)}
          disabled={busy}
        /></label
      >
      <label
        >{t('Workspace name', 'Nama workspace')}<input
          required
          maxlength="64"
          bind:value={workspaceName}
          oninput={() => (dirty = true)}
          disabled={busy}
        /></label
      >
      <button class="button primary" disabled={busy || !owner.trim() || !workspaceName.trim()}
        >{onboarding
          ? t('Generate my access code', 'Buat kode aksesku')
          : t('Save workspace', 'Simpan workspace')}</button
      >
    </form>
  {:else}
    <div
      class="access-save"
      role="region"
      aria-label={t('Save your access code', 'Simpan kode aksesmu')}
    >
      <h3>{t('Keep this code somewhere safe.', 'Simpan kode ini di tempat aman.')}</h3>
      <p>
        {t(
          'Use it to connect more devices. It stays valid until you replace it. Anyone with this code can access your entire collection. We cannot show this same code again after you leave.',
          'Gunakan untuk menghubungkan perangkat lain. Kode berlaku sampai kamu menggantinya. Siapa pun yang memiliki kode ini dapat mengakses seluruh koleksimu. Kode yang sama tidak bisa ditampilkan lagi setelah kamu meninggalkan halaman ini.',
        )}
      </p>
      <label
        >{t('Private access code', 'Kode akses privat')}<textarea
          readonly
          value={token}
          rows="3"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"></textarea></label
      >
      <div class="inline-actions">
        <button
          class="button secondary"
          disabled={busy}
          onclick={() =>
            act(async () => {
              await navigator.clipboard.writeText(token);
              copied = true;
            })}
          >{copied ? t('Copied', 'Tersalin') : t('Copy access code', 'Salin kode akses')}</button
        >
        <button class="button secondary" disabled={busy} onclick={downloadCode}
          >{t('Download code file', 'Unduh file kode')}</button
        >
      </div>
      <label class="saved-check"
        ><input type="checkbox" bind:checked={saved} disabled={busy} /><span
          >{t(
            'I saved the code in a safe place.',
            'Aku sudah menyimpan kode di tempat aman.',
          )}</span
        ></label
      >
      <button class="button primary" disabled={!saved || busy} onclick={confirmSaved}
        >{onboarding
          ? t('Open my workspace', 'Buka workspace-ku')
          : t('Finish saving code', 'Selesai menyimpan kode')}</button
      >
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if message}<p role="status" class="fine-print">{message}</p>{/if}
  {#if !onboarding && !token}
    <details class="workspace-action">
      <summary>{t('Replace access code', 'Ganti kode akses')}</summary>
      <p>
        {t(
          'The old access code and unused temporary connection codes stop working. Devices already connected stay connected. Save the new code before leaving.',
          'Kode akses lama dan kode penghubung sementara yang belum dipakai tidak berlaku lagi. Perangkat yang sudah terhubung tetap terhubung. Simpan kode baru sebelum keluar.',
        )}
      </p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            token = (await post('/access-code', { confirm: rotateConfirm })).token;
            saved = false;
            copied = false;
            rotateConfirm = '';
          });
        }}
      >
        <label
          >{t(
            'Type workspace name to replace the code',
            'Ketik nama workspace untuk mengganti kode',
          )}<input bind:value={rotateConfirm} autocomplete="off" disabled={busy} /></label
        >
        <button class="button secondary" disabled={busy || rotateConfirm !== user.workspaceName}
          >{t('Generate replacement code', 'Buat kode pengganti')}</button
        >
      </form>
    </details>
    <details class="workspace-action">
      <summary>{t('Reset study progress', 'Reset progress belajar')}</summary>
      <p>
        {t(
          'This permanently clears review history, schedules, and streaks for this workspace across connected devices. Your decks, notes, media, and preferences stay. Save a backup first if you want to keep your history.',
          'Ini menghapus riwayat review, jadwal, dan streak workspace ini secara permanen di semua perangkat terhubung. Deck, catatan, media, dan pengaturan tetap ada. Simpan backup dahulu jika ingin mempertahankan riwayatmu.',
        )}
      </p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await post('/progress/reset', { confirm: resetConfirm });
            resetConfirm = '';
            await onupdated(true);
            message = t('Study progress reset.', 'Progress belajar direset.');
          });
        }}
      >
        <label
          >{t(
            'Type workspace name to reset progress',
            'Ketik nama workspace untuk mereset progress',
          )}<input bind:value={resetConfirm} autocomplete="off" disabled={busy} /></label
        >
        <button class="button secondary" disabled={busy || resetConfirm !== user.workspaceName}
          >{t('Reset all study progress', 'Reset seluruh progress belajar')}</button
        >
      </form>
    </details>
  {/if}
</section>

<style>
  .workspace-action {
    margin-top: 24px;
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }
  summary {
    cursor: pointer;
    min-height: 44px;
    padding: 12px 0;
    font-size: 14px;
  }
  .workspace-action form {
    max-width: 480px;
    margin-top: 20px;
  }
  .workspace-action button {
    margin-top: 16px;
  }
  .access-save h3 {
    font:
      28px/1.2 Georgia,
      serif;
    margin: 24px 0 16px;
  }
  .access-save p {
    max-width: 640px;
  }
  .access-save label {
    margin-top: 20px;
  }
  textarea {
    width: 100%;
    font:
      14px/1.6 ui-monospace,
      monospace;
    overflow-wrap: anywhere;
    resize: vertical;
  }
  .access-save .inline-actions {
    justify-content: start;
    margin-top: 16px;
  }
  .saved-check {
    display: flex;
    align-items: start;
    gap: 12px;
    font-size: 14px;
    margin-bottom: 20px;
  }
  .saved-check input {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--accent);
  }
</style>
