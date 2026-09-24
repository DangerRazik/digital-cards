export function createYandexMapsUrl(address: string): string {
  const encodedAddress = encodeURIComponent(address);

  return `https://yandex.ru/maps/?text=${encodedAddress}`;
}

export function createYandexMapEmbedUrl(address: string): string {
  const encodedAddress = encodeURIComponent(address);

  return `https://yandex.ru/map-widget/v1/?mode=search&text=${encodedAddress}&z=16`;
}
