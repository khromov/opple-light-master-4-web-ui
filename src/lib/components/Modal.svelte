<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';

  let { open = $bindable(false), title, children, actions }: { open: boolean; title: string; children: Snippet; actions?: Snippet } = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  let downOnBackdrop = false;
  const titleId = `dlg-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<!-- Close on a click on the backdrop itself (not a drag that ends there). -->
<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  onclose={() => (open = false)}
  onpointerdown={(e) => (downOnBackdrop = e.target === dialog)}
  onclick={(e) => e.target === dialog && downOnBackdrop && (open = false)}
>
  <div class="box">
    <header>
      <h2 id={titleId}>{title}</h2>
      <button class="icon" aria-label="Close" onclick={() => (open = false)}><X size={18} /></button>
    </header>
    <div class="body">{@render children()}</div>
    {#if actions}<footer>{@render actions()}</footer>{/if}
  </div>
</dialog>

<style>
  dialog {
    border: none;
    padding: 0;
    background: transparent;
    max-width: min(440px, calc(100vw - 32px));
    width: 100%;
    color: var(--text);
  }
  dialog::backdrop {
    background: rgba(8, 10, 14, 0.55);
  }
  .box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 6px;
  }
  h2 {
    font-size: 1.05rem;
  }
  .body {
    padding: 6px 16px 16px;
    color: var(--text-2);
  }
  footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 0 16px 16px;
  }
  .icon {
    background: none;
    border: none;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-2);
    display: grid;
  }
  .icon:hover {
    background: var(--surface-2);
  }
</style>
