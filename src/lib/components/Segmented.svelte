<script lang="ts" generics="T extends string">
  let { value = $bindable(), options, label }: { value: T; options: { value: T; label: string }[]; label: string } = $props();
</script>

<div class="seg" role="tablist" aria-label={label}>
  {#each options as o (o.value)}
    <button role="tab" aria-selected={value === o.value} class:on={value === o.value} onclick={() => (value = o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    background: var(--surface-2);
    border-radius: 10px;
    padding: 3px;
    gap: 3px;
  }
  button {
    flex: 1;
    border: none;
    background: none;
    padding: 7px 12px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--text-2);
    cursor: pointer;
  }
  button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
