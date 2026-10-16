<script lang="ts">
  import { cloudMode, mediaUrls } from './cloud/api';
  import { cardDocument, type Card } from './render';
  import { preferences, t } from './preferences.svelte';
  let { card, answer = false }: { card: Card; answer?: boolean } = $props();
  let frame = $state<HTMLIFrameElement>();
  let observer: ResizeObserver | undefined;
  let urls = $state<Record<string, string>>({}),
    loading = $state(cloudMode),
    loadError = $state('');
  let loadedId = $state('');
  const doc = $derived(cardDocument(card, answer, cloudMode ? urls : undefined, preferences.theme));
  $effect(() => {
    const current = card;
    let live = true;
    if (cloudMode) {
      loading = true;
      loadError = '';
      mediaUrls(current)
        .then((value) => {
          if (live) {
            urls = value;
            loadedId = current.id;
            loading = false;
          }
        })
        .catch((e) => {
          if (live) {
            loadError = e.message;
            loading = false;
          }
        });
    }
    return () => {
      live = false;
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
  }
  $effect(() => () => observer?.disconnect());
</script>

{#if loading || (cloudMode && loadedId !== card.id && !loadError)}<p class="muted" role="status">
    {t('Opening card…', 'Membuka kartu…')}
  </p>{:else if loadError}<p class="error" role="alert">{loadError}</p>{:else}
  <iframe
    bind:this={frame!}
    title={answer ? t('Card answer', 'Jawaban kartu') : t('Card question', 'Pertanyaan kartu')}
    srcdoc={doc}
    sandbox="allow-same-origin"
    onload={resize}
  ></iframe>
{/if}
