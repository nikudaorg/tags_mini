// A real <a target="_blank"> navigation rather than window.open(): browsers
// (Safari in particular) block script-initiated popups far more aggressively
// than an actual link activation, even one triggered programmatically from
// inside a genuine user gesture handler.
export const openNoteTab = (id: string) => {
  const a = document.createElement('a');
  a.href = `/note/${id}`;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
