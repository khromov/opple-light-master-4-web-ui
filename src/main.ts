import { mount } from 'svelte'
import './app.css'

// `?demo` runs the whole UI against a simulated Light Master 4 (no hardware needed).
if (new URLSearchParams(location.search).has('demo')) {
  const { installFakeBluetooth } = await import('./lib/ble/fake-meter')
  ;(window as unknown as { __lm4demo: unknown }).__lm4demo = installFakeBluetooth()
}

const { default: App } = await import('./App.svelte')

export default mount(App, { target: document.getElementById('app')! })
