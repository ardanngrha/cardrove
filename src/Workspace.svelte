<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import {
    BookOpen,
    Layers,
    Search,
    ChartNoAxesColumnIncreasing,
    Settings,
    Upload,
    ArrowRight,
    ArrowLeft,
    X,
    RotateCcw,
    Check,
    Sun,
    Moon,
    LogOut,
    Download,
    LoaderCircle,
  } from '@lucide/svelte';
  import Flashcard from './Flashcard.svelte';
  import InstallPanel from './InstallPanel.svelte';
  import WorkspaceProfile from './WorkspaceProfile.svelte';
  import { studyShortcut } from './study-shortcuts';
  import { cloudMode, cloudApi, initialClaim, initialSetup } from './cloud/api';
  import { preview, type Card } from './render';
  import {
    preferences,
    t,
    locale,
    number,
    browserTimezone,
    applyPreferences,
  } from './preferences.svelte';

  type Deck = {
    id: string;
    name: string;
    total: number;
    new_count: number;
    due_count: number;
    studied: number;
  };
  type Summary = {
    decks: Deck[];
    reviews: { day: string; count: number; elapsed: number; correct: number }[];
    today: { count: number; elapsed: number; correct: number; introduced: number };
    streak: number;
    settings: { dailyNew: number; goal: number; timezone: string };
    total: number;
  };
  const brand = 'Cardrove';
  let user = $state<{
    name: string;
    workspaceName?: string;
    needsOnboarding?: boolean;
    deviceId?: string;
  } | null>(null);
  let setup = $state(cloudMode && initialSetup),
    ready = $state(false),
    busy = $state(false),
    syncing = $state(false);
  let view = $state('home'),
    error = $state(''),
    message = $state('');
  let name = $state(''),
    password = $state(cloudMode ? initialClaim : '');
  let summary = $state<Summary | null>(null),
    selectedDeck = $state('');
  let card = $state<Card | null>(null),
    revealed = $state(false),
    intervals = $state<Record<number, number>>({});
  let nextDue = $state<number | null>(null),
    dailyLimit = $state(false),
    reviewId = $state<string | number | null>(null);
  let startedAt = Date.now(),
    sessionCount = $state(0);
  let pendingReview: { key: string; operationId: string; rating: number; elapsed: number } | null =
    null;
  let modal = $state(''),
    file = $state<File | null>(null),
    importResult = $state<any>(null),
    importProgress = $state('');
  let search = $state(''),
    filter = $state(''),
    page = $state(0),
    cards = $state<Card[]>([]),
    cardTotal = $state(0);
  let editing = $state<Card | null>(null),
    editFields = $state<string[]>([]),
    inspect = $state<Card | null>(null);
  let dailyNew = $state(20),
    goal = $state(20),
    timezone = $state(browserTimezone());
  let DevicePanel = $state<any>(null),
    deviceLoading = $state(false);
  let accessCodePending = $state(false);
  const selected = $derived(summary?.decks.find((d) => d.id === selectedDeck));
  const due = $derived(summary?.decks.reduce((n, d) => n + d.due_count, 0) ?? 0);
  const fresh = $derived(summary?.decks.reduce((n, d) => n + d.new_count, 0) ?? 0);
  const availableNew = $derived(
    Math.min(
      fresh,
      Math.max(0, (summary?.settings.dailyNew ?? 20) - (summary?.today.introduced ?? 0)),
    ),
  );
  const progress = $derived(
    Math.min(100, Math.round(((summary?.today.count ?? 0) / (summary?.settings.goal ?? 20)) * 100)),
  );
  const navigation = $derived([
    { id: 'home', label: t('Study', 'Belajar'), icon: BookOpen },
    { id: 'decks', label: t('Library', 'Koleksi'), icon: Layers },
    { id: 'browse', label: t('Browse', 'Jelajahi'), icon: Search },
    { id: 'stats', label: t('Progress', 'Kemajuan'), icon: ChartNoAxesColumnIncreasing },
    { id: 'settings', label: t('Settings', 'Pengaturan'), icon: Settings },
  ]);
  const title = $derived(
    view === 'study'
      ? t('Review session', 'Sesi review')
      : navigation.find((n) => n.id === view)?.label || brand,
  );
  $effect(applyPreferences);

  async function api(route: string, options: RequestInit = {}): Promise<any> {
    if (cloudMode) {
      try {
        return await cloudApi(route, options);
      } catch (e: any) {
        if (e.status === 409 && route === '/review') {
          pendingReview = null;
          await next();
          await refresh();
        }
        if (e.status === 401) {
          user = null;
          ready = true;
        }
        throw e;
      }
    }
    const response = await fetch('/api' + route, {
      ...options,
      headers: {
        'X-Cardrove': '1',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        user = null;
        ready = true;
      }
      throw Error(
        data.error || t('Request failed. Please try again.', 'Permintaan gagal. Coba lagi.'),
      );
    }
    return data;
  }
  async function refresh() {
    summary = await api('/summary');
    dailyNew = summary!.settings.dailyNew;
    goal = summary!.settings.goal;
    timezone = summary!.settings.timezone;
  }
  async function reloadProfile(reset = false) {
    user = (await api('/session')).user;
    if (user) await refresh();
    else summary = null;
    if (reset) {
      pendingReview = null;
      reviewId = null;
      card = null;
      sessionCount = 0;
      view = 'home';
    }
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function login() {
    await run(async () => {
      user = await api('/auth', { method: 'POST', body: JSON.stringify({ name, password }) });
      password = '';
      await refresh();
    });
  }
  async function navigate(to: string) {
    if (accessCodePending) {
      message = t(
        'Save your new access code before leaving this page.',
        'Simpan kode akses baru sebelum meninggalkan halaman ini.',
      );
      return;
    }
    if (busy) return;
    view = to;
    error = '';
    message = '';
    await run(async () => {
      if (to === 'browse') await queryCards();
      if (to !== 'study') await refresh();
      if (to === 'settings' && cloudMode && !DevicePanel) {
        deviceLoading = true;
        try {
          DevicePanel = (await import('./cloud/DevicePanel.svelte')).default;
        } finally {
          deviceLoading = false;
        }
      }
    });
    document.getElementById('page-title')?.focus();
  }
  async function queryCards() {
    const data = await api(
      '/cards?' + new URLSearchParams({ q: search, deck: filter, page: String(page) }),
    );
    cards = data.cards;
    cardTotal = data.total;
  }
  async function next() {
    const data = await api(
      '/next' + (selectedDeck ? '?deck=' + encodeURIComponent(selectedDeck) : ''),
    );
    card = data.card;
    intervals = data.intervals ?? {};
    nextDue = data.nextDue;
    dailyLimit = data.dailyLimit;
    revealed = false;
    startedAt = Date.now();
  }
  async function study(id = '') {
    await run(async () => {
      selectedDeck = id;
      sessionCount = 0;
      reviewId = null;
      await next();
      view = 'study';
    });
  }
  async function rate(rating: number) {
    if (!card || !revealed) return;
    const current = card;
    await run(async () => {
      const key = current.id + ':' + current.version;
      if (!pendingReview || pendingReview.key !== key)
        pendingReview = {
          key,
          operationId: crypto.randomUUID(),
          rating,
          elapsed: Date.now() - startedAt,
        };
      const result = await api('/review', {
        method: 'POST',
        body: JSON.stringify({
          id: current.id,
          rating: pendingReview.rating,
          version: current.version,
          elapsed: pendingReview.elapsed,
          operationId: pendingReview.operationId,
        }),
      });
      pendingReview = null;
      reviewId = result.reviewId;
      sessionCount++;
      await next();
      await refresh();
    });
  }
  async function undo() {
    await run(async () => {
      await api('/undo', { method: 'POST', body: JSON.stringify({ reviewId }) });
      reviewId = null;
      sessionCount = Math.max(0, sessionCount - 1);
      await next();
      await refresh();
    });
  }
  function openImport() {
    if (accessCodePending) {
      message = t('Save your new access code first.', 'Simpan kode akses baru terlebih dahulu.');
      return;
    }
    modal = 'import';
    file = null;
    importResult = null;
    importProgress = '';
    error = '';
  }
  async function doImport() {
    if (!file) return;
    await run(async () => {
      importProgress = t('Opening your deck…', 'Membuka deck…');
      if (cloudMode) {
        const { importDeck } = await import('./cloud/import-client');
        importResult = await importDeck(file!, (text) => (importProgress = text));
      } else {
        const body = new FormData();
        body.append('deck', file!);
        importResult = await api('/import', { method: 'POST', body });
      }
      await refresh();
    });
  }
  async function saveNote() {
    if (!editing) return;
    const current = editing;
    await run(async () => {
      await api('/notes/' + encodeURIComponent(current.note_id), {
        method: 'PATCH',
        body: JSON.stringify({ fields: editFields, modified: current.modified }),
      });
      editing = null;
      modal = '';
      message = t(
        'Note saved. All cards using this note have been updated.',
        'Catatan tersimpan. Semua kartu dari catatan ini ikut diperbarui.',
      );
      await queryCards();
    });
  }
  function interval(ms: number) {
    const minutes = Math.max(1, Math.round(ms / 60000));
    if (minutes < 60) return number(minutes) + t(' min', ' mnt');
    if (minutes < 1440) return number(Math.round(minutes / 60)) + t(' hr', ' jam');
    return number(Math.round(minutes / 1440)) + t(' d', ' hari');
  }
  const label = (deck: Deck) => deck.name.split('::').pop() || deck.name;
  function calendar() {
    return Array.from({ length: 28 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - 27 + i);
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: summary?.settings.timezone || browserTimezone(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
      return {
        day,
        count: summary?.reviews.find((r) => r.day === day)?.count || 0,
        label: date.toLocaleDateString(locale(), {
          month: 'short',
          day: 'numeric',
          timeZone: summary?.settings.timezone || browserTimezone(),
        }),
      };
    });
  }
  const activity = $derived(calendar());
  const timezones = [...new Set([browserTimezone(), ...Intl.supportedValuesOf('timeZone'), 'UTC'])];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () => (reducedMotion.matches ? 0 : 170);
  function handleStudyKeys(e: KeyboardEvent) {
    const target = e.target as Element | null;
    const action = studyShortcut(e, {
      reviewing: view === 'study' && !!card,
      revealed,
      blocked: !!modal || busy,
      editing: !!target?.closest?.(
        'input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])',
      ),
      nativeActivation: !!target?.closest?.('button,a,summary,audio,video'),
    });
    if (action === null) return;
    e.preventDefault();
    if (action === 'reveal') revealed = true;
    else void rate(action);
  }
  function closeModal() {
    if (!busy) {
      modal = '';
      error = '';
    }
  }
  function trapFocus(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement;
    const elements = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea,select,a[href]',
        ),
      ).filter((e) => e.offsetParent !== null);
    queueMicrotask(() =>
      (elements().find((e) => e.tagName === 'INPUT') || elements()[0] || node).focus(),
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
      if (e.key !== 'Tab') return;
      const list = elements(),
        first = list[0],
        last = list.at(-1);
      if (!first) {
        e.preventDefault();
        node.focus();
      } else if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === node)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', key);
    return {
      destroy() {
        node.removeEventListener('keydown', key);
        previous?.focus();
      },
    };
  }
  onMount(() => {
    void (async () => {
      try {
        const session = await api('/session');
        user = session.user;
        setup = cloudMode ? initialSetup : session.setup;
        if (user) await refresh();
        else if (cloudMode && initialSetup && initialClaim) await login();
      } catch (e) {
        error = (e as Error).message;
      } finally {
        ready = true;
      }
    })();
    const focus = async () => {
      if (!user || busy) return;
      syncing = true;
      try {
        await reloadProfile();
        if (!user) return;
        if (view === 'study' && card) {
          const found = await api('/card/' + card.id);
          if (found.version !== card.version || found.modified !== card.modified) await next();
        }
      } catch (e) {
        error = (e as Error).message;
      } finally {
        syncing = false;
      }
    };
    window.addEventListener('focus', focus);
    window.addEventListener('keydown', handleStudyKeys);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('keydown', handleStudyKeys);
    };
  });
</script>

<svelte:head><title>{title} · {brand}</title></svelte:head>
<a class="skip-link" href="#main-content">{t('Skip to content', 'Ke konten utama')}</a>
{#snippet appearance()}
  <div class="appearance">
    <select
      aria-label={t('Interface language', 'Bahasa antarmuka')}
      bind:value={preferences.language}
      ><option value="en">English</option><option value="id">Indonesia</option></select
    >
    <button
      class="icon-button"
      aria-label={t('Switch color theme', 'Ganti tema warna')}
      title={t('Switch color theme', 'Ganti tema warna')}
      onclick={() =>
        (preferences.theme =
          preferences.theme === 'dark' ||
          (preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
            ? 'light'
            : 'dark')}
      ><Sun class="sun-icon" size={19} /><Moon class="moon-icon" size={19} /></button
    >
  </div>
{/snippet}
{#if !ready}
  <main id="main-content" class="boot">
    <span class="wordmark">{brand}</span><LoaderCircle class="spin" size={22} />
    <p role="status">{t('Opening your study space…', 'Membuka ruang belajar…')}</p>
  </main>
{:else if !user}
  <main id="main-content" class="entry">
    <section class="entry-story">
      <a class="wordmark" href="/">{brand}<span>.</span></a>
      <div class="entry-title">
        <p class="index-label">{t('A little, remembered.', 'Sedikit, lalu menetap.')}</p>
        <h1>
          {t('Make room for', 'Beri ruang untuk')}<br /><em>{t('what stays.', 'yang menetap.')}</em>
        </h1>
        <p>
          {t(
            'Your decks. Your pace. A quiet place to practise what matters to you.',
            'Deck-mu. Ritmemu. Tempat tenang untuk melatih hal yang berarti buatmu.',
          )}
        </p>
      </div>
      <div class="entry-foot">
        <span>01 / {t('Return. Recall. Repeat.', 'Kembali. Ingat. Ulangi.')}</span><span
          >{t('A personal study space', 'Ruang belajar pribadi')}</span
        >
      </div>
    </section>
    <section class="entry-form">
      {@render appearance()}
      <div class="entry-form-inner">
        <p class="index-label">
          {cloudMode
            ? t('Your device, connected', 'Perangkatmu, terhubung')
            : t('Your own study space', 'Ruang belajarmu sendiri')}
        </p>
        <h2>
          {setup
            ? t('Settle in.', 'Mulai dari sini.')
            : cloudMode
              ? t('Connect this device.', 'Hubungkan perangkat ini.')
              : t('Welcome back.', 'Selamat datang kembali.')}
        </h2>
        <p>
          {cloudMode
            ? setup
              ? t(
                  'Your private setup link connects your first device. If it has expired, generate a new link from your deployment checkout.',
                  'Tautan penyiapan privat menghubungkan perangkat pertamamu. Jika kedaluwarsa, buat tautan baru dari folder deployment-mu.',
                )
              : t(
                  'Use the access code you saved when setting up your workspace, or a temporary code from a connected device.',
                  'Gunakan kode akses yang disimpan saat menyiapkan workspace, atau kode sementara dari perangkat yang sudah terhubung.',
                )
            : setup
              ? t(
                  'Use the first-owner setup code printed by your server. You will choose your names and receive a permanent access code next.',
                  'Gunakan kode penyiapan pemilik yang tercetak di server. Setelah ini, isi nama dan simpan kode akses tetapmu.',
                )
              : t(
                  'Use the same account to continue on your phone or computer.',
                  'Gunakan akun yang sama untuk melanjutkan di HP atau komputer.',
                )}
        </p>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          {#if !cloudMode && !setup}<label
              >{t('Legacy account name (optional)', 'Nama akun lama (opsional)')}<input
                bind:value={name}
                maxlength="64"
                autocomplete="username"
              /></label
            >{/if}
          <label
            >{setup
              ? t('First-owner setup code', 'Kode penyiapan pemilik')
              : t('Access code', 'Kode akses')}<input
              type="password"
              bind:value={password}
              required
              minlength={cloudMode || setup ? 64 : 8}
              maxlength="256"
              autocomplete={cloudMode ? 'off' : setup ? 'new-password' : 'current-password'}
              placeholder={cloudMode || setup
                ? t('Paste your code', 'Tempel kode di sini')
                : t('At least 8 characters', 'Minimal 8 karakter')}
            /></label
          >
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          <button class="button primary" disabled={busy}
            >{#if busy}<LoaderCircle class="spin" size={18} />{/if}{cloudMode
              ? t('Connect this device', 'Hubungkan perangkat ini')
              : setup
                ? t('Create study space', 'Buat ruang belajar')
                : t('Open study space', 'Buka ruang belajar')}<ArrowRight size={17} /></button
          >
        </form>
        {#if cloudMode}
          <details class="setup-help">
            <summary>{t('Just deployed your own copy?', 'Baru selesai deploy sendiri?')}</summary>
            <p>
              {t(
                'Create your private setup link from the repository folder on your computer. It opens the name and workspace form for your first device.',
                'Buat tautan setup privat dari folder repo di komputermu. Tautan itu membuka form nama dan workspace untuk perangkat pertama.',
              )}
            </p>
            <p>
              <a
                href="https://ardanngrha.github.io/cardrove/docs/self-host/#set-up-the-first-device"
                target="_blank"
                rel="noopener noreferrer"
                >{t('Read the first-device setup steps', 'Baca langkah setup perangkat pertama')}
                <ArrowRight size={14} /></a
              >
            </p>
            <p class="fine-print">
              {t(
                'The public address does not grant ownership. Keep your setup link private.',
                'Alamat publik tidak memberikan kepemilikan. Simpan tautan setup-mu secara privat.',
              )}
            </p>
          </details>
        {/if}
        <p class="fine-print">
          {cloudMode
            ? t(
                'Your saved access code stays valid until replaced. Temporary device and first-owner setup codes expire and work once.',
                'Kode akses tersimpan berlaku sampai diganti. Kode perangkat sementara dan kode penyiapan pemilik berlaku sekali dan bisa kedaluwarsa.',
              )
            : t(
                'Your collection is stored on this server. Keep a backup of your data folder.',
                'Koleksimu disimpan di server ini. Simpan cadangan folder data.',
              )}
        </p>
      </div>
    </section>
  </main>
{:else if user.needsOnboarding}
  <main id="main-content" class="onboarding-page">
    <header><a class="wordmark" href="/">{brand}<span>.</span></a>{@render appearance()}</header>
    <WorkspaceProfile
      {user}
      {api}
      onboarding
      onupdated={reloadProfile}
      onpending={(pending) => (accessCodePending = pending)}
    />
  </main>
{:else}
  <div class="app-shell" class:review-mode={view === 'study'}>
    <aside class="rail">
      <a class="wordmark" href="/">{brand}<span>.</span></a>
      <p class="rail-caption" dir="auto">
        {user.workspaceName || t('Your study space', 'Ruang belajarmu')}
      </p>
      <nav aria-label={t('Main navigation', 'Navigasi utama')}>
        {#each navigation as item}<button
            aria-current={view === item.id || (item.id === 'home' && view === 'study')
              ? 'page'
              : undefined}
            onclick={() => navigate(item.id)}
            ><item.icon size={20} /><span>{item.label}</span
            >{#if item.id === 'home' && due > 0}<small class="nav-count">{number(due)}</small
              >{/if}</button
          >{/each}
      </nav>
      <div class="rail-bottom">
        <p class="rail-note">
          {t('Knowledge grows', 'Pengetahuan tumbuh')}<br /><em
            >{t('when you return.', 'saat kamu kembali.')}</em
          >
        </p>
        <div class="profile">
          <span dir="auto">{user.name}</span><small
            >{syncing
              ? t('Refreshing…', 'Memperbarui…')
              : cloudMode
                ? t('Connected device', 'Perangkat terhubung')
                : t('Local server', 'Server lokal')}</small
          ><button
            class="icon-button"
            aria-label={t('Sign out', 'Keluar')}
            title={t('Sign out', 'Keluar')}
            disabled={busy || accessCodePending}
            onclick={() =>
              run(async () => {
                await api('/logout', { method: 'POST' });
                user = null;
                setup = false;
              })}><LogOut size={18} /></button
          >
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span class="crumb"
          >{t('Workspace', 'Ruang belajar')}<span>/</span><strong>{title}</strong></span
        >
        <div class="topbar-actions">
          {@render appearance()}<button
            class="button secondary import-action"
            aria-label={t('Import deck', 'Impor deck')}
            onclick={openImport}
            ><Upload size={16} /><span>{t('Import deck', 'Impor deck')}</span></button
          >
        </div>
      </header>
      <main id="main-content" class:study-main={view === 'study'} aria-busy={busy}>
        {#if error}<div class="banner error" role="alert">
            <span>{error}</span>{#if view === 'study'}<button
                class="text-button"
                onclick={() => run(next)}>{t('Reload card', 'Muat ulang kartu')}</button
              >{/if}<button
              class="icon-button"
              aria-label={t('Dismiss error', 'Tutup pesan')}
              onclick={() => (error = '')}><X size={18} /></button
            >
          </div>{/if}
        {#if message}<div class="banner success" role="status">
            <span>{message}</span><button
              class="icon-button"
              aria-label={t('Dismiss message', 'Tutup pesan')}
              onclick={() => (message = '')}><X size={18} /></button
            >
          </div>{/if}
        {#key view}<div class="page-content" in:fly={{ y: 6, duration: motion() }}>
            {#if view === 'home' && summary}
              <div class="page-heading">
                <div>
                  <p class="index-label">01 / {t('A daily practice', 'Latihan harian')}</p>
                  <h1 id="page-title" tabindex="-1">
                    {t('Back to what matters.', 'Kembali ke yang berarti.')}
                  </h1>
                </div>
                <time
                  >{new Date().toLocaleDateString(locale(), {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    timeZone: timezone,
                  })}</time
                >
              </div>
              <section class="daily-spread" aria-labelledby="session-heading">
                <div class="session-copy">
                  <p class="index-label">{t('Ready when you are', 'Siap saat kamu siap')}</p>
                  <h2 id="session-heading">
                    {due + availableNew > 0
                      ? t('A little today.', 'Sedikit hari ini.')
                      : t('Room to breathe.', 'Ruang untuk jeda.')}<br /><em
                      >{due + availableNew > 0
                        ? t('More remembered.', 'Lebih melekat esok.')
                        : t('Return tomorrow.', 'Kembali esok hari.')}</em
                    >
                  </h2>
                  <p>
                    {due + availableNew > 0
                      ? t(
                          'Pick up where you left off. Your next cards are ready.',
                          'Lanjutkan dari tempatmu berhenti. Kartu berikutnya sudah menunggu.',
                        )
                      : t(
                          'You have finished the cards available now. Your collection will be here when the next review is due.',
                          'Kartu yang tersedia sudah selesai. Koleksimu tetap di sini saat review berikutnya tiba.',
                        )}
                  </p>
                  <button class="button primary" disabled={busy} onclick={() => study()}
                    >{due + availableNew > 0
                      ? t('Begin review', 'Mulai review')
                      : t('Check next review', 'Cek review berikutnya')}<ArrowRight
                      size={18}
                    /></button
                  >
                </div>
                <div class="session-index">
                  <div>
                    <span>{t('Due for review', 'Jadwal review')}</span><strong>{number(due)}</strong
                    >
                  </div>
                  <div>
                    <span>{t('New cards available', 'Kartu baru tersedia')}</span><strong
                      >{number(availableNew)}</strong
                    >
                  </div>
                  <p>{t('One card at a time.', 'Satu kartu, satu langkah.')}</p>
                </div>
              </section>
              <div class="daily-ledger">
                <div>
                  <span>{t('Reviews today', 'Review hari ini')}</span><strong
                    >{number(summary.today.count)}<small>
                      / {number(summary.settings.goal)}</small
                    ></strong
                  ><progress
                    value={progress}
                    max="100"
                    aria-label={t('Daily review goal', 'Target review harian')}
                  ></progress>
                </div>
                <div>
                  <span>{t('Current streak', 'Ritme belajar')}</span><strong
                    >{number(summary.streak)}<small>
                      {t(summary.streak === 1 ? 'day' : 'days', 'hari')}</small
                    ></strong
                  >
                </div>
                <div>
                  <span>{t('Time today', 'Waktu hari ini')}</span><strong
                    >{number(Math.round(summary.today.elapsed / 60000))}<small>
                      {t('min', 'menit')}</small
                    ></strong
                  >
                </div>
              </div>
              <div class="section-heading">
                <h2>{t('On your shelf', 'Di rak belajarmu')}</h2>
                <button class="text-button" onclick={() => navigate('decks')}
                  >{t('Open library', 'Buka koleksi')}<ArrowRight size={17} /></button
                >
              </div>
              {@render deckRows(summary.decks.slice(0, 4))}
              <footer class="workspace-foot">
                <span>{brand} / {t('Made for returning', 'Tempat untuk kembali')}</span><span
                  >{t('Your pace, your collection.', 'Ritmemu, koleksimu.')}</span
                >
              </footer>
            {:else if view === 'decks' && summary}
              <div class="page-heading">
                <div>
                  <p class="index-label">02 / {t('Your collection', 'Koleksimu')}</p>
                  <h1 id="page-title" tabindex="-1">
                    {t('A shelf of possibilities.', 'Satu rak, banyak kemungkinan.')}
                  </h1>
                  <p>
                    {number(summary.total)}
                    {t('cards across', 'kartu dalam')}
                    {number(summary.decks.length)}
                    {t('decks.', 'deck.')}
                  </p>
                </div>
              </div>
              {@render deckRows(summary.decks)}
            {:else if view === 'study'}
              <div class="study-top">
                <button class="text-button" onclick={() => navigate('home')}
                  ><ArrowLeft size={17} />{t('Finish', 'Selesai')}</button
                >
                <div>
                  <h1 id="page-title" tabindex="-1" dir="auto">
                    {selected ? label(selected) : t('All decks', 'Semua deck')}
                  </h1>
                  <span
                    >{number(sessionCount)} {t('reviewed this session', 'review di sesi ini')}</span
                  >
                </div>
                <button class="text-button" disabled={!reviewId || busy} onclick={undo}
                  ><RotateCcw size={17} />{t('Undo', 'Urungkan')}</button
                >
              </div>
              {#if card}
                {#key card.id}<section class="study-card" in:fly={{ y: 8, duration: motion() }}>
                    <div class="study-card-header">
                      <span>{revealed ? t('Answer', 'Jawaban') : t('Recall', 'Ingat kembali')}</span
                      ><span dir="auto">{card.model.name}</span>
                    </div>
                    <Flashcard {card} answer={revealed} onshortcut={handleStudyKeys} />
                    <div class="study-card-footer">
                      <span dir="auto">{card.tags || card.deck_name}</span><span
                        >{(card.reps ?? 0) > 0
                          ? t('Review', 'Review')
                          : t('New card', 'Kartu baru')}</span
                      >
                    </div>
                  </section>{/key}
                <div class="answer-zone">
                  {#if !revealed}<p>
                      {t(
                        'Pause. Try to recall before you turn the card.',
                        'Ambil jeda. Coba ingat sebelum membuka jawaban.',
                      )}
                    </p>
                    <button
                      class="button primary reveal"
                      onclick={() => (revealed = true)}
                      disabled={busy}
                      >{t('Reveal answer', 'Tampilkan jawaban')}<kbd>space / enter</kbd></button
                    >{:else}<p>
                      {t('How well did you remember?', 'Seberapa mudah kamu mengingatnya?')}
                    </p>
                    <div class="rating-buttons">
                      {#each [{ n: 1, label: t('Again', 'Ulangi'), hint: t('Not yet', 'Belum ingat'), className: 'again' }, { n: 2, label: t('Hard', 'Sulit'), hint: t('With effort', 'Perlu usaha'), className: 'hard' }, { n: 3, label: t('Good', 'Baik'), hint: t('Remembered', 'Ingat'), className: 'good' }, { n: 4, label: t('Easy', 'Mudah'), hint: t('No hesitation', 'Tanpa ragu'), className: 'easy' }] as rating}<button
                          class={rating.className}
                          disabled={busy}
                          onclick={() => rate(rating.n)}
                          ><span>{rating.label}<kbd>{rating.n}</kbd></span><strong
                            >{interval(intervals[rating.n] || 0)}</strong
                          ><small>{rating.hint}</small></button
                        >{/each}
                    </div>{/if}
                </div>
              {:else}<section class="session-done">
                  <span class="done-symbol"><Check size={30} /></span>
                  <p class="index-label">
                    {t('A good place to pause', 'Saat yang tepat untuk jeda')}
                  </p>
                  <h2>
                    {sessionCount
                      ? t('A little more remembered.', 'Sedikit lagi yang menetap.')
                      : t('You are up to date.', 'Untuk saat ini, selesai.')}
                  </h2>
                  <p>
                    {sessionCount
                      ? `${number(sessionCount)} ${t('reviews completed this session.', 'review selesai di sesi ini.')}`
                      : t(
                          'No cards are available right now.',
                          'Belum ada kartu yang tersedia saat ini.',
                        )}
                  </p>
                  {#if nextDue}<p>
                      {t('Next review:', 'Review berikutnya:')}
                      {new Date(nextDue).toLocaleString(locale(), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: timezone,
                      })}
                    </p>{/if}{#if dailyLimit}<p>
                      {t(
                        'Your daily new-card allowance has been reached. Adjust it in Settings.',
                        'Batas kartu baru harian sudah tercapai. Sesuaikan di Pengaturan.',
                      )}
                    </p>{/if}
                  <div class="inline-actions">
                    <button class="button primary" onclick={() => navigate('home')}
                      >{t('Back to study space', 'Kembali ke ruang belajar')}</button
                    ><button class="button secondary" disabled={busy} onclick={() => run(next)}
                      >{t('Check again', 'Cek lagi')}</button
                    >{#if reviewId}<button class="text-button" disabled={busy} onclick={undo}
                        >{t('Undo last answer', 'Urungkan jawaban terakhir')}</button
                      >{/if}
                  </div>
                </section>{/if}
            {:else if view === 'browse'}
              <div class="page-heading">
                <div>
                  <p class="index-label">03 / {t('Look a little closer', 'Kenali lebih dekat')}</p>
                  <h1 id="page-title" tabindex="-1">
                    {t('Inside your cards.', 'Di balik kartu-kartumu.')}
                  </h1>
                  <p>
                    {t(
                      'Search, preview, and edit the notes in your collection.',
                      'Cari, lihat, dan rapikan catatan dalam koleksimu.',
                    )}
                  </p>
                </div>
              </div>
              <form
                class="browse-toolbar"
                onsubmit={(e) => {
                  e.preventDefault();
                  page = 0;
                  void run(queryCards);
                }}
              >
                <div class="search-box">
                  <Search size={19} /><input
                    aria-label={t('Search cards', 'Cari kartu')}
                    bind:value={search}
                    placeholder={t('Search text or tags…', 'Cari teks atau tag…')}
                  /><button class="text-button" disabled={busy}>{t('Search', 'Cari')}</button>
                </div>
                <select
                  aria-label={t('Filter by deck', 'Filter deck')}
                  bind:value={filter}
                  onchange={() => {
                    page = 0;
                    void run(queryCards);
                  }}
                  ><option value="">{t('All decks', 'Semua deck')}</option
                  >{#each summary?.decks || [] as deck}<option value={deck.id}>{label(deck)}</option
                    >{/each}</select
                >
              </form>
              <div class="card-list" aria-live="polite">
                <div class="card-list-head">
                  <span>{t('Front / question', 'Depan / pertanyaan')}</span><span
                    >{t('Back / answer', 'Belakang / jawaban')}</span
                  ><span>{t('Deck', 'Deck')}</span><span></span>
                </div>
                {#each cards as item}{@const text = preview(item)}
                  <article class="card-row">
                    <button
                      class="card-preview-button"
                      dir="auto"
                      onclick={() => {
                        inspect = item;
                        revealed = false;
                        modal = 'preview';
                      }}>{text.front.slice(0, 110) || t('[Media card]', '[Kartu media]')}</button
                    >
                    <p dir="auto">{text.back.slice(0, 140)}</p>
                    <div class="card-meta">
                      <span dir="auto">{item.deck_name.split('::').pop()}</span><small
                        >{(item.reps || 0) > 0
                          ? t('Reviewed', 'Pernah diulang')
                          : t('New', 'Baru')}</small
                      >
                    </div>
                    <button
                      class="text-button"
                      aria-label={t('Edit note: ', 'Edit catatan: ') + text.front.slice(0, 60)}
                      onclick={() => {
                        editing = item;
                        editFields = [...item.fields];
                        modal = 'edit';
                      }}>{t('Edit', 'Edit')}</button
                    >
                  </article>{/each}{#if !cards.length}<div class="empty">
                    <h2>
                      {busy
                        ? t('Opening your cards…', 'Membuka kartu…')
                        : t('No matching cards.', 'Tidak ada kartu yang cocok.')}
                    </h2>
                    <p>
                      {t(
                        'Try another search or choose a different deck.',
                        'Coba pencarian lain atau pilih deck berbeda.',
                      )}
                    </p>
                  </div>{/if}
              </div>
              <div class="pagination">
                <span
                  >{number(cardTotal)}
                  {t(cardTotal === 1 ? 'card' : 'cards', 'kartu')} · {t('Page', 'Halaman')}
                  {number(page + 1)}</span
                >
                <div>
                  <button
                    class="icon-button"
                    aria-label={t('Previous page', 'Halaman sebelumnya')}
                    disabled={!page || busy}
                    onclick={() => {
                      page--;
                      void run(queryCards);
                    }}><ArrowLeft size={19} /></button
                  ><button
                    class="icon-button"
                    aria-label={t('Next page', 'Halaman berikutnya')}
                    disabled={(page + 1) * 50 >= cardTotal || busy}
                    onclick={() => {
                      page++;
                      void run(queryCards);
                    }}><ArrowRight size={19} /></button
                  >
                </div>
              </div>
            {:else if view === 'stats' && summary}
              <div class="page-heading">
                <div>
                  <p class="index-label">
                    04 / {t('The habit takes shape', 'Kebiasaan mulai terbentuk')}
                  </p>
                  <h1 id="page-title" tabindex="-1">
                    {t('Small returns, over time.', 'Kembali, sedikit demi sedikit.')}
                  </h1>
                  <p>
                    {t(
                      'A record of the time you have put into learning.',
                      'Catatan waktu yang kamu sisihkan untuk belajar.',
                    )}
                  </p>
                </div>
              </div>
              <div class="progress-ledger">
                <div>
                  <strong>{number(summary.streak)}</strong><span
                    >{t('Day streak', 'Hari berturut-turut')}</span
                  >
                </div>
                <div>
                  <strong>{number(summary.reviews.reduce((n, r) => n + r.count, 0))}</strong><span
                    >{t('Reviews in recorded history', 'Review dalam riwayat tercatat')}</span
                  >
                </div>
                <div>
                  <strong>{number(summary.decks.reduce((n, d) => n + d.studied, 0))}</strong><span
                    >{t('Cards studied', 'Kartu pernah dipelajari')}</span
                  >
                </div>
              </div>
              <section class="activity-panel">
                <div class="section-heading">
                  <h2>{t('The last 28 days', '28 hari terakhir')}</h2>
                  <span class="muted">{t('Reviews per day', 'Review per hari')}</span>
                </div>
                <div
                  class="activity-bars"
                  role="img"
                  aria-label={t(
                    'Daily review activity. Values listed below.',
                    'Aktivitas review harian. Nilai tersedia di bawah.',
                  )}
                  aria-hidden="true"
                >
                  {#each activity as day}<div title={`${day.label}: ${day.count}`}>
                      <span
                        style={`height:${Math.max(3, (day.count / Math.max(1, ...activity.map((x) => x.count))) * 145)}px`}
                        class:has-reviews={day.count > 0}
                      ></span>
                    </div>{/each}
                </div>
                <div class="activity-caption">
                  <span>{activity[0]?.label}</span><span>{activity[27]?.label}</span>
                </div>
                <details class="activity-data">
                  <summary>{t('Read daily values', 'Lihat nilai harian')}</summary>
                  <dl>
                    {#each activity as day}<div>
                        <dt>{day.label}</dt>
                        <dd>{number(day.count)}</dd>
                      </div>{/each}
                  </dl>
                </details>
              </section>
              <section class="settings-panel">
                <h2>{t('Today, in detail', 'Hari ini, lebih dekat')}</h2>
                <div class="today-detail">
                  <p>
                    <strong
                      >{summary.today.count
                        ? Math.round((summary.today.correct / summary.today.count) * 100)
                        : 0}%</strong
                    >{t('Rated Hard, Good, or Easy', 'Jawaban Sulit, Baik, atau Mudah')}
                  </p>
                  <p>
                    <strong>{number(summary.today.introduced)}</strong>{t(
                      'New cards introduced',
                      'Kartu baru diperkenalkan',
                    )}
                  </p>
                  <p>
                    <strong
                      >{number(Math.round(summary.today.elapsed / 60000))}
                      {t('min', 'menit')}</strong
                    >{t('Active review time', 'Waktu review aktif')}
                  </p>
                </div>
                <p class="fine-print">
                  {t(
                    'Only activity recorded in this installation is included. Anki review history is not imported.',
                    'Hanya aktivitas di instalasi ini yang dihitung. Riwayat review Anki tidak diimpor.',
                  )}
                </p>
              </section>
            {:else if view === 'settings' && summary}
              <div class="page-heading">
                <div>
                  <p class="index-label">05 / {t('Make yourself at home', 'Atur agar nyaman')}</p>
                  <h1 id="page-title" tabindex="-1">{t('Your own rhythm.', 'Ritmemu sendiri.')}</h1>
                </div>
                <button
                  class="text-button"
                  disabled={busy || accessCodePending}
                  onclick={() =>
                    run(async () => {
                      await api('/logout', { method: 'POST' });
                      user = null;
                      setup = false;
                    })}><LogOut size={17} />{t('Sign out', 'Keluar')}</button
                >
              </div>
              <section class="settings-panel">
                <h2>{t('Daily practice', 'Latihan harian')}</h2>
                <form
                  class="settings-form"
                  onsubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api('/settings', {
                        method: 'PATCH',
                        body: JSON.stringify({ dailyNew, goal, timezone }),
                      });
                      await refresh();
                      message = t('Settings saved.', 'Pengaturan tersimpan.');
                    });
                  }}
                >
                  <label
                    >{t('New cards per day', 'Kartu baru per hari')}<small
                      >{t(
                        'Across all decks. Due reviews keep their own schedule.',
                        'Berlaku untuk semua deck. Review tetap mengikuti jadwalnya.',
                      )}</small
                    ><input type="number" min="0" max="500" required bind:value={dailyNew} /></label
                  ><label
                    >{t('Daily review goal', 'Target review harian')}<small
                      >{t(
                        'A progress marker, not a limit on reviews.',
                        'Penanda kemajuan, bukan pembatas review.',
                      )}</small
                    ><input type="number" min="1" max="1000" required bind:value={goal} /></label
                  ><label
                    >{t('Time zone', 'Zona waktu')}<select bind:value={timezone}
                      >{#each [...new Set([timezone, ...timezones])] as zone}<option value={zone}
                          >{zone}</option
                        >{/each}</select
                    ></label
                  ><button class="button primary" disabled={busy}
                    >{t('Save preferences', 'Simpan pengaturan')}</button
                  >
                </form>
              </section>
              <section class="settings-panel">
                <h2>{t('Reading preferences', 'Preferensi membaca')}</h2>
                <div class="settings-form">
                  <label
                    >{t('Interface language', 'Bahasa antarmuka')}<select
                      bind:value={preferences.language}
                      ><option value="en">English</option><option value="id"
                        >Bahasa Indonesia</option
                      ></select
                    ><small
                      >{t(
                        'Deck content keeps its original language.',
                        'Konten deck tetap menggunakan bahasa aslinya.',
                      )}</small
                    ></label
                  ><label
                    >{t('Appearance', 'Tampilan')}<select bind:value={preferences.theme}
                      ><option value="system">{t('Follow device', 'Ikuti perangkat')}</option
                      ><option value="light">{t('Light', 'Terang')}</option><option value="dark"
                        >{t('Dark', 'Gelap')}</option
                      ></select
                    ></label
                  >
                </div>
              </section>
              <WorkspaceProfile
                {user}
                {api}
                onupdated={reloadProfile}
                onpending={(pending) => (accessCodePending = pending)}
              />
              <InstallPanel />
              {#if cloudMode}{#if DevicePanel}<DevicePanel
                    {api}
                    currentId={user.deviceId || ''}
                  />{:else if deviceLoading}<p role="status">
                    {t('Opening device settings…', 'Membuka pengaturan perangkat…')}
                  </p>{:else}<button class="button secondary" onclick={() => navigate('settings')}
                    >{t('Retry device settings', 'Coba pengaturan perangkat lagi')}</button
                  >{/if}{:else}<section class="settings-panel">
                  <h2>{t('Progress and devices', 'Progress dan perangkat')}</h2>
                  <p>
                    {t(
                      'Sign in to this same server on your other devices. The server needs to stay running.',
                      'Masuk ke server yang sama di perangkat lain. Server perlu tetap menyala.',
                    )}
                  </p>
                  <a class="button secondary" href="/api/export" download
                    ><Download size={17} />{t(
                      'Download progress archive',
                      'Unduh arsip progress',
                    )}</a
                  >
                  <p class="fine-print">
                    {t(
                      'The JSON archive contains progress, not decks or media, and cannot be restored in the app. For a full backup, stop the server and copy its data folder.',
                      'Arsip JSON berisi progress, tanpa deck atau media, dan belum bisa dipulihkan lewat app. Untuk backup lengkap, hentikan server dan salin folder data.',
                    )}
                  </p>
                </section>{/if}
              <section class="settings-panel">
                <h2>{t('What your decks can do', 'Kompatibilitas deck')}</h2>
                <p>
                  {t(
                    'Import Anki .apkg files with basic, reversed, simple cloze, furigana, images, audio, and subdecks. Review scheduling starts fresh with FSRS.',
                    'Impor .apkg Anki dengan Basic, reversed, cloze sederhana, furigana, gambar, audio, dan subdeck. Jadwal review dimulai dari awal dengan FSRS.',
                  )}
                </p>
                <p class="fine-print">
                  {t(
                    'Card scripts, Image Occlusion, add-ons, AnkiWeb sync, and offline study are not supported. Deck content and attribution belong to their authors.',
                    'Script kartu, Image Occlusion, add-on, sinkronisasi AnkiWeb, dan belajar offline belum didukung. Konten deck dan atribusinya tetap milik pembuat masing-masing.',
                  )}
                </p>
              </section>
            {:else}<p class="empty" role="status">
                {t('Opening your collection…', 'Membuka koleksimu…')}
              </p>{/if}
          </div>{/key}
      </main>
    </div>
  </div>
{/if}

{#snippet deckRows(decks: Deck[])}
  <div class="deck-list">
    {#each decks as deck, i}<article class="deck-row">
        <span class="deck-index">{String(i + 1).padStart(2, '0')}</span>
        <div class="deck-name">
          <h3 dir="auto">{label(deck)}</h3>
          <p dir="auto">
            {deck.name.includes('::')
              ? deck.name.split('::').slice(0, -1).join(' / ')
              : `${number(deck.total)} ${t('cards in this deck', 'kartu dalam deck ini')}`}
          </p>
        </div>
        <div class="deck-count">
          <strong>{number(deck.due_count)}</strong><small>{t('due', 'review')}</small>
        </div>
        <div class="deck-count">
          <strong>{number(deck.new_count)}</strong><small>{t('new', 'baru')}</small>
        </div>
        <div class="deck-actions">
          <button
            class="text-button"
            onclick={() => {
              filter = deck.id;
              page = 0;
              void navigate('browse');
            }}>{t('Browse', 'Jelajahi')}</button
          ><button class="button secondary" disabled={busy} onclick={() => study(deck.id)}
            >{t('Review', 'Belajar')}<ArrowRight size={16} /></button
          >
        </div>
      </article>{/each}{#if !decks.length}<div class="empty">
        <p class="index-label">{t('An open shelf', 'Rak yang menunggu')}</p>
        <h2>{t('What will you learn next?', 'Apa yang ingin kamu pelajari?')}</h2>
        <p>
          {t(
            'Bring an Anki deck to start your collection.',
            'Bawa deck Anki untuk memulai koleksimu.',
          )}
        </p>
        <button class="button primary" onclick={openImport}
          ><Upload size={17} />{t('Import your first deck', 'Impor deck pertamamu')}</button
        >
      </div>{/if}
  </div>
{/snippet}

{#if modal}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
    transition:fade={{ duration: motion() }}
  >
    <div
      use:trapFocus
      class="modal"
      class:wide={modal !== 'import'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
    >
      <button
        class="icon-button modal-close"
        aria-label={t('Close dialog', 'Tutup dialog')}
        disabled={busy}
        onclick={closeModal}><X size={21} /></button
      >
      {#if modal === 'import'}<p class="index-label">
          {t('Bring your curiosity', 'Bawa rasa ingin tahumu')}
        </p>
        <h2 id="modal-title">{t('A new chapter.', 'Bab yang baru.')}</h2>
        <p>
          {t(
            'Import an Anki .apkg file, including its images and audio.',
            'Impor file Anki .apkg, beserta gambar dan audionya.',
          )}
        </p>
        {#if importResult}<div class="import-result">
            <Check size={26} />
            <h3>
              {importResult.duplicate
                ? t('This deck is already here.', 'Deck ini sudah ada.')
                : t('Your deck is ready.', 'Deck-mu sudah siap.')}
            </h3>
            <p>
              {number(importResult.cards)}
              {t('cards', 'kartu')} · {number(importResult.notes)}
              {t('notes', 'catatan')} · {number(importResult.media)} media
            </p>
            {#each importResult.warnings || [] as warning}<p class="import-warning">
                {warning}
              </p>{/each}
          </div>
          <button
            class="button primary full"
            onclick={() => {
              modal = '';
              void navigate('decks');
            }}>{t('Open your library', 'Buka koleksi')}</button
          >{:else}<label class="upload-zone"
            ><Upload size={26} /><strong
              >{file ? file.name : t('Choose your deck', 'Pilih deck-mu')}</strong
            ><span
              >{file
                ? (file.size / 1024 / 1024).toFixed(1) + ' MB'
                : '.apkg · ' + t('up to 512 MB', 'maks. 512 MB')}</span
            ><input
              type="file"
              accept=".apkg"
              disabled={busy}
              onchange={(e) => (file = e.currentTarget.files?.[0] || null)}
            /></label
          >
          <p class="fine-print">
            {t(
              'New decks start with fresh scheduling. Reimporting updates newer notes while keeping this app’s review progress.',
              'Deck baru dimulai dengan jadwal baru. Impor ulang memperbarui catatan yang lebih baru dan mempertahankan progress app ini.',
            )}
          </p>
          {#if busy}<p class="import-progress" role="status">
              <LoaderCircle class="spin" size={18} />{importProgress}
            </p>{/if}<button class="button primary full" disabled={!file || busy} onclick={doImport}
            >{busy ? t('Importing…', 'Mengimpor…') : t('Import deck', 'Impor deck')}</button
          >{/if}
      {:else if modal === 'edit' && editing}<p class="index-label">
          {t('Note', 'Catatan')} / {editing.model.name}
        </p>
        <h2 id="modal-title">{t('Make it clearer.', 'Buat lebih jelas.')}</h2>
        <p>
          {t(
            'Changes apply to every card using this note. Fields may contain HTML and media references.',
            'Perubahan berlaku untuk semua kartu dari catatan ini. Field dapat berisi HTML dan referensi media.',
          )}
        </p>
        <form
          class="edit-form"
          onsubmit={(e) => {
            e.preventDefault();
            void saveNote();
          }}
        >
          {#each editing.model.flds as field, i}<label
              >{field.name}<textarea dir="auto" rows={i === 0 ? 2 : 4} bind:value={editFields[i]}
              ></textarea></label
            >{/each}<button class="button primary" disabled={busy}
            >{t('Save note', 'Simpan catatan')}</button
          >
        </form>
      {:else if modal === 'preview' && inspect}<p class="index-label">
          {t('Card preview', 'Pratinjau kartu')}
        </p>
        <h2 id="modal-title">{inspect.model.name}</h2>
        <div class="preview-frame"><Flashcard card={inspect} answer={revealed} /></div>
        <button class="button secondary full" onclick={() => (revealed = !revealed)}
          ><RotateCcw size={17} />{revealed
            ? t('Show question', 'Lihat pertanyaan')
            : t('Show answer', 'Lihat jawaban')}</button
        >{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  </div>
{/if}
