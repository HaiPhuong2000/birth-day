export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Fullscreen overlay root; hidden until shown. */
export function overlay(extraClass = ''): HTMLDivElement {
  const root = el('div', `overlay ${extraClass}`.trim());
  root.hidden = true;
  document.body.append(root);
  return root;
}
