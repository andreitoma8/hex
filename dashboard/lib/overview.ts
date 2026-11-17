/**
 * The protocol overview /init-audit writes to `.hex/overview.md`, split for display:
 * the H1 ("Protocol Overview: Vault") becomes the page title ("Vault"), the rest the body.
 */
export function splitOverview(md: string, fallbackTitle: string): { title: string; body: string } {
  const text = md.replace(/^﻿/, '').trim();
  const h1 = /^#\s+(.+?)\s*(?:\n+|$)/.exec(text);
  if (!h1) return { title: fallbackTitle, body: text };
  const heading = h1[1].replace(/^(?:protocol\s+)?overview\s*[:—–-]\s*/i, '').trim();
  const generic = /^(?:protocol\s+)?overview$/i.test(heading);
  return {
    title: heading && !generic ? heading : fallbackTitle,
    body: text.slice(h1[0].length).trim(),
  };
}
