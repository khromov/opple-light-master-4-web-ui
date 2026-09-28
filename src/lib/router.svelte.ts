// Hash routing (works on GitHub Pages without server rewrites).

export type Route =
  | { name: 'photometry' }
  | { name: 'flicker' }
  | { name: 'reports' }
  | { name: 'report'; id: string }
  | { name: 'shared'; code: string }
  | { name: 'guide' }
  | { name: 'diagnostics' }
  | { name: 'settings' };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  switch (parts[0]) {
    case 'flicker':
      return { name: 'flicker' };
    case 'reports':
      return { name: 'reports' };
    case 'report':
      return parts[1] ? { name: 'report', id: decodeURIComponent(parts[1]) } : { name: 'reports' };
    case 'shared':
      return parts[1] ? { name: 'shared', code: parts[1] } : { name: 'photometry' };
    case 'guide':
      return { name: 'guide' };
    case 'diagnostics':
      return { name: 'diagnostics' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'photometry' };
  }
}

class Router {
  route = $state<Route>(parse(typeof location !== 'undefined' ? location.hash : ''));
  /** How many entries this page added on top of the one it was opened in (kept in history.state). */
  private depth = 0;
  private replacing = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const d = history.state?.lmDepth;
    if (typeof d === 'number') this.depth = d;
    else history.replaceState({ ...history.state, lmDepth: 0 }, '');
    window.addEventListener('hashchange', () => {
      this.route = parse(location.hash);
      const known = history.state?.lmDepth;
      if (typeof known === 'number' && !this.replacing) this.depth = known; // browser back/forward
      else {
        if (!this.replacing) this.depth++;
        history.replaceState({ ...history.state, lmDepth: this.depth }, '');
      }
      this.replacing = false;
    });
  }

  go(path: string) {
    location.hash = `#/${path}`;
  }

  /** Replace the current entry (after deleting or saving, so Back doesn't return to a stale page). */
  replace(path: string) {
    if (location.hash === `#/${path}`) return;
    this.replacing = true;
    location.replace(`#/${path}`);
  }

  /** In-app Back: never leaves the site; falls back to `fallback` when opened directly. */
  back(fallback = '') {
    if (this.depth > 0) history.back();
    else this.replace(fallback);
  }
}

export const router = new Router();
