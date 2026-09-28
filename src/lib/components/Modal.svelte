<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';

  let {
    open = $bindable(false),
    title,
    children,
    actions,
    variant = 'dialog',
  }: {
    open: boolean;
    title: string;
    children: Snippet;
    actions?: Snippet;
    /** 'sheet' slides up from the bottom on phones (info and confirmations); forms with a text field stay a centred dialog. */
    variant?: 'dialog' | 'sheet';
  } = $props();
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
  class:sheet={variant === 'sheet'}
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
    gap: 8px;
    padding: 12px 8px 4px 16px;
  }
  h2 {
    font-size: 1.05rem;
  }
  .body {
    padding: 4px 16px 16px;
    color: var(--text-2);
  }
  .body :global(p) {
    margin: 0;
  }
  footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 0 16px 16px;
  }
  footer :global(.btn) {
    flex: 1;
  }
  @media (min-width: 561px) {
    footer :global(.btn) {
      flex: 0 1 auto;
      min-width: 110px;
    }
  }
  .icon {
    background: none;
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    cursor: pointer;
    color: var(--text-2);
    display: grid;
    place-items: center;
    flex: none;
  }
  .icon:hover {
    background: var(--surface-2);
  }
  @media (max-width: 560px) {
    dialog.sheet {
      margin: auto 0 0;
      max-width: 100vw;
      width: 100vw;
    }
    dialog.sheet .box {
      border-radius: 20px 20px 0 0;
      border-bottom: 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
    dialog.sheet .box::before {
      content: '';
      display: block;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--border);
      margin: 8px auto 0;
    }
    dialog.sheet[open] {
      animation: sheet-in 0.22s ease-out;
    }
  }
  @keyframes sheet-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog.sheet[open] {
      animation: none;
    }
  }
</style>
