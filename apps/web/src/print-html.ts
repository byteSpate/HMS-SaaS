// Printing a document page from the server (T-BIL-04 receipts; ADR-010; FR-PRN-005). The page is
// complete HTML with its fonts embedded, so it prints from a hidden frame without leaving the
// screen. The frame is removed after the print dialog closes.
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.addEventListener('load', () => {
    const view = frame.contentWindow;
    view?.addEventListener('afterprint', () => frame.remove(), { once: true });
    view?.focus();
    view?.print();
  });
  frame.srcdoc = html;
  document.body.append(frame);
}
