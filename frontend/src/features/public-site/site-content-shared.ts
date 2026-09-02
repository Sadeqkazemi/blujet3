export function siteMediaUrl(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  return `${import.meta.env.VITE_API_URL}/site-content/media/${fileId}`;
}

export function jobPostingImageUrl(
  imageUrl: string | null | undefined,
  imageFileId?: string | null,
): string | null {
  if (imageUrl) {
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${import.meta.env.VITE_API_URL}${imageUrl}`;
  }
  if (!imageFileId) return null;
  return `${import.meta.env.VITE_API_URL}/careers/media/${imageFileId}`;
}

const DEST_GRADIENTS = [
  'linear-gradient(160deg,#bcd6f2,#e3eefb)',
  'linear-gradient(160deg,#c8d9ec,#e8eef6)',
  'linear-gradient(160deg,#bfe0d8,#e6f2ee)',
  'linear-gradient(160deg,#cdd9ec,#eaeff7)',
];

export function destinationGradient(index: number): string {
  return DEST_GRADIENTS[index % DEST_GRADIENTS.length];
}
