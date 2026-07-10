/** Pure string utilities for lightweight inline markdown formatting. */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code style="background:var(--border);padding:1px 4px;border-radius:3px;font-family:JetBrains Mono,monospace;font-size:10px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text);font-weight:600;">$1</strong>');
}
