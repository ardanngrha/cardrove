<script lang="ts">
  import { installation, installApp } from './install.svelte';
  import { t } from './preferences.svelte';
</script>

<section class="settings-panel">
  <h2>{t('Add to home screen', 'Tambahkan ke layar utama')}</h2>
  {#if installation.installed}
    <p role="status">
      {t(
        'You are using Cardrove as an installed web app.',
        'Kamu sedang memakai Cardrove sebagai aplikasi web terpasang.',
      )}
    </p>
  {:else}
    <p>
      {t(
        'Open your study space from an app icon on your phone or computer.',
        'Buka ruang belajarmu lewat ikon aplikasi di HP atau komputer.',
      )}
    </p>
    {#if installation.available}
      <button class="button secondary" disabled={installation.busy} onclick={installApp}
        >{t('Install Cardrove', 'Pasang Cardrove')}</button
      >
    {/if}
    <details class="install-help">
      <summary>{t('How to install on your device', 'Cara memasang di perangkatmu')}</summary>
      <dl>
        <dt>iPhone / iPad</dt>
        <dd>
          {t(
            'Open Cardrove in Safari. Tap Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add.',
            'Buka Cardrove di Safari. Ketuk Bagikan, lalu Tambahkan ke Layar Utama. Aktifkan Buka sebagai App Web jika tersedia, lalu ketuk Tambah.',
          )}
        </dd>
        <dt>Android</dt>
        <dd>
          {t(
            'Open Cardrove in Chrome. Open the browser menu, then Install app or Add to Home screen.',
            'Buka Cardrove di Chrome. Buka menu browser, lalu pilih Instal aplikasi atau Tambahkan ke layar utama.',
          )}
        </dd>
        <dt>{t('Computer', 'Komputer')}</dt>
        <dd>
          {t(
            'Use the install icon or Install Cardrove in Chrome or Edge. In Safari on Mac, choose File, then Add to Dock.',
            'Gunakan ikon instalasi atau Pasang Cardrove di Chrome atau Edge. Di Safari pada Mac, pilih File, lalu Tambahkan ke Dock.',
          )}
        </dd>
      </dl>
    </details>
    {#if installation.error}<p role="alert" class="error">
        {t(
          'The install prompt could not open. Use the browser menu instead.',
          'Dialog instalasi tidak bisa dibuka. Gunakan menu browser.',
        )}
      </p>{/if}
  {/if}
  <p class="fine-print">
    {t(
      'Study still requires a connection to your server. When connecting a phone over a local network, serve the app over HTTPS for installation. An installed app may ask you to connect the device again.',
      'Belajar tetap memerlukan koneksi ke servermu. Untuk memasang dari server di jaringan lokal, gunakan HTTPS. Aplikasi yang terpasang mungkin meminta perangkat dihubungkan lagi.',
    )}
  </p>
</section>

<style>
  .install-help {
    margin-top: 20px;
  }
  summary {
    cursor: pointer;
    min-height: 44px;
    padding: 12px 0;
    font-size: 14px;
  }
  dl {
    margin: 12px 0 0;
  }
  dt {
    font-size: 14px;
    font-weight: 600;
    margin-top: 20px;
  }
  dd {
    margin: 8px 0 0;
    font-size: 14px;
    line-height: 1.7;
    color: var(--muted);
  }
</style>
