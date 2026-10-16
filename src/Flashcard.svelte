<script lang="ts">
  import { untrack } from 'svelte';
  import { cloudMode, mediaUrls } from './cloud/api';
  import { cardPresentation, type Card } from './render';
  import { preferences, t } from './preferences.svelte';
  let {
    card,
    answer = false,
    onshortcut,
  }: { card: Card; answer?: boolean; onshortcut?: (event: KeyboardEvent) => void } = $props();
  let frame = $state<HTMLIFrameElement>();
  let observer: ResizeObserver | undefined;
  let urls = $state<Record<string, string>>({}),
    loading = $state(cloudMode),
    loadError = $state('');
  let loadedId = $state('');
  let failedAudio = $state<string[]>([]),
    revision = $state(0);
  let request = 0;
  let frameEvents: AbortController | undefined;
  const presentation = $derived(
    cardPresentation(card, answer, cloudMode ? urls : undefined, preferences.theme),
  );
  async function loadMedia(current: Card) {
    const attempt = ++request;
    failedAudio = [];
    loadError = '';
    if (!cloudMode) {
      revision++;
      return;
    }
    loading = true;
    try {
      const value = await mediaUrls(current);
      if (attempt !== request) return;
      urls = value;
      loadedId = current.id;
      revision++;
    } catch (e) {
      if (attempt === request) loadError = (e as Error).message;
    } finally {
      if (attempt === request) loading = false;
    }
  }
  $effect(() => {
    const current = card;
    untrack(() => {
      void loadMedia(current);
    });
    return () => {
      request++;
    };
  });
  function resize() {
    if (!frame?.contentDocument) return;
    observer?.disconnect();
    const element = frame;
    const body = element.contentDocument!.body;
    const update = () => (element.style.height = Math.max(220, body.scrollHeight + 4) + 'px');
    update();
    observer = new ResizeObserver(update);
    observer.observe(body);
    frameEvents?.abort();
    frameEvents = new AbortController();
    element.contentDocument!.addEventListener('keydown', (event) => onshortcut?.(event), {
      signal: frameEvents.signal,
    });
  }
  $effect(() => () => {
    observer?.disconnect();
    frameEvents?.abort();
  });
</script>

{#if loading || (cloudMode && loadedId !== card.id && !loadError)}<p class="muted" role="status">
    {t('Opening card…', 'Membuka kartu…')}
  </p>{:else if loadError}<p class="error" role="alert">{loadError}</p>{:else}
  <iframe
    bind:this={frame!}
    title={answer ? t('Card answer', 'Jawaban kartu') : t('Card question', 'Pertanyaan kartu')}
    srcdoc={presentation.document}
    sandbox="allow-same-origin"
    onload={resize}
  ></iframe>
  {#key revision}
    {#each presentation.audio as src, i (src)}
      <div class="card-audio">
        <label for={'card-audio-' + i}
          >{t('Audio', 'Audio')}{presentation.audio.length > 1 ? ` ${i + 1}` : ''}</label
        >
        <audio
          id={'card-audio-' + i}
          {src}
          controls
          preload="metadata"
          onerror={() => {
            if (!failedAudio.includes(src)) failedAudio = [...failedAudio, src];
          }}
        >
          {t(
            'Your browser does not support this audio player.',
            'Browser ini tidak mendukung pemutar audio.',
          )}
        </audio>
        {#if failedAudio.includes(src)}
          <p role="alert" class="error">
            {t(
              'Audio could not play. Refresh the link, then tap Play again. This file may use an unsupported format.',
              'Audio tidak bisa diputar. Perbarui tautannya, lalu ketuk Putar lagi. Format file mungkin tidak didukung.',
            )}
          </p>
          <button class="button secondary" onclick={() => loadMedia(card)}
            >{t('Refresh audio', 'Perbarui audio')}</button
          >
        {/if}
      </div>
    {/each}
  {/key}
{/if}

<style>
  .card-audio {
    padding: 0 24px 24px;
    max-width: 560px;
    margin: auto;
  }
  label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 8px;
  }
  audio {
    display: block;
    width: 100%;
    max-width: 100%;
    min-height: 44px;
  }
  .error {
    font-size: 13px;
    line-height: 1.6;
    margin: 12px 0;
  }
</style>
