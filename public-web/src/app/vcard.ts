import { PublicCard, visible, webUrl } from './card.model';

// vCard 3.0: экранируем значения, чтобы перенос строки не создавал новое поле.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// Ограничение длины считается в байтах UTF-8, а не в символах кириллицы.
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let lineByteLength = 0;

  for (const character of line) {
    const characterByteLength = encoder.encode(character).length;

    if (lineByteLength + characterByteLength > 75) {
      result += '\r\n ';
      // Пробел продолжения тоже занимает байт в новой строке.
      lineByteLength = 1;
    }

    result += character;
    lineByteLength += characterByteLength;
  }

  return result;
}

export function createVCard(card: PublicCard): string {
  const nameParts = [card.lastName, card.firstName, card.middleName, '', ''];
  const escapedName = nameParts.map(escapeText).join(';');

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapedName}`,
    `FN:${escapeText(card.displayName)}`,
  ];

  if (visible(card.organization)) {
    lines.push(`ORG:${escapeText(card.organization.value)}`);
  }

  if (visible(card.jobTitle)) {
    lines.push(`TITLE:${escapeText(card.jobTitle.value)}`);
  }

  if (card.blocks.phones && visible(card.mobile)) {
    lines.push(`TEL;TYPE=CELL:${escapeText(card.mobile.value)}`);
  }

  if (card.blocks.phones && visible(card.workPhone)) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeText(card.workPhone.value)}`);
  }

  if (card.blocks.email && visible(card.email)) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeText(card.email.value)}`);
  }

  if (card.blocks.website && visible(card.website)) {
    const url = webUrl(card.website.value);

    if (url) {
      lines.push(`URL:${escapeText(url)}`);
    }
  }

  lines.push('END:VCARD');
  const foldedLines = lines.map(foldLine);

  return foldedLines.join('\r\n') + '\r\n';
}

export function downloadVCard(card: PublicCard): void {
  const content = createVCard(card);
  const blob = new Blob([content], {
    type: 'text/vcard;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = card.slug.replace(/[^a-z0-9-]/gi, '') || 'contact';

  link.href = url;
  link.download = `${filename}.vcf`;

  document.body.append(link);
  link.click();
  link.remove();

  // Даём мобильному браузеру время начать скачивание.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
