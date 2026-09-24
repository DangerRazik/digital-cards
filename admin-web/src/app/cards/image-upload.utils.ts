export async function prepareImage(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Выберите JPG, PNG или WebP.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Выберите файл размером до 10 МБ.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Не удалось открыть изображение. Выберите другой файл.');
  }

  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Браузер не поддерживает обработку изображения.');
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Не удалось подготовить изображение.'));
        }
      }, 'image/png');
    });
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error('Изображение слишком большое. Выберите фотографию меньшего размера.');
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

export function privateImageUrl(url: string): string {
  if (/^\/api\/public\/images\/[a-f0-9-]{36}\.png$/.test(url)) {
    return url.replace('/api/public/images/', '/api/admin/images/');
  }
  if (/^\/assets\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|svg)$/i.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
      return parsed.href;
    }
  } catch {
    // Незавершённую ссылку из поля ввода не отправляем в img.
  }
  return '';
}
