export function validateCardUrl(value: string): URL {
  const url = new URL(value);
  const supportedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
  const containsCredentials = Boolean(url.username || url.password);

  if (!supportedProtocol || containsCredentials || value.length > 2048) {
    throw new Error('Некорректный публичный адрес визитки.');
  }
  return url;
}

export async function createCardQr(value: string): Promise<string> {
  validateCardUrl(value);
  // Библиотека загружается только при открытии QR. В код включаем ровно публичную ссылку.
  const qrCode = await import('qrcode');
  return qrCode.toDataURL(value, {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 1024,
    color: {
      dark: '#000000ff',
      light: '#ffffffff',
    },
  });
}
