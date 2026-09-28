<script lang="ts" generics="T extends string">
  let {
    value = $bindable(),
    options,
    label,
    panel,
  }: { value: T; options: { value: T; label: string }[]; label: string; /** id of the tabpanel these tabs control */ panel?: string } = $props();

  let buttons: HTMLButtonElement[] = $state([]);

  // ARIA tabs keyboard model: arrows move (and select, as the tabs switch views instantly), Home/End jump.
  function onKey(e: KeyboardEvent, i: number) {
    const n = options.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    value = options[next].value;
    buttons[next]?.focus();
  }
</script>

<div class="seg" role="tablist" aria-label={label}>
  {#each options as o, i (o.value)}
    <button
      bind:this={buttons[i]}
      role="tab"
      aria-selected={value === o.value}
      aria-controls={panel}
      tabindex={value === o.value ? 0 : -1}
      class:on={value === o.value}
      onclick={() => (value = o.value)}
      onkeydown={(e) => onKey(e, i)}>{o.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: flex;
    background: var(--surface-2);
    border-radius: 12px;
    padding: 4px;
    gap: 4px;
  }
  button {
    flex: 1;
    min-height: 38px;
    border: none;
    background: none;
    padding: 7px 12px;
    border-radius: 9px;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--text-2);
    cursor: pointer;
  }
  button.on {
    background: var(--surface-3);
    color: var(--text);
    box-shadow:
      0 1px 2px rgba(16, 24, 40, 0.1),
      0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent);
  }
</style>
