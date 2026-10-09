export const THEME_STORAGE_KEY = "voltkart-theme";

/**
 * Runs in <head> before first paint so a dark-mode user never sees a flash of the
 * light theme. Kept as a plain string because it executes before React loads.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var d=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
