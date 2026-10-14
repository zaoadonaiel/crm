/**
 * Tiny scripts inlined in <head> that run before first paint, so saved UI
 * preferences apply without a flash. Plain module (no "use client") so the
 * server layout can import the strings directly.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export const sidebarScript = `(function(){try{if(localStorage.getItem("sidebar")==="collapsed")document.documentElement.setAttribute("data-sidebar","collapsed")}catch(e){}})()`;
