import axios from 'axios';

const IMAGE_FETCH_TIMEOUT_MS = 25000;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB

/**
 * Fetch image URLs and return as base64 data URLs.
 * Fast-path: data URLs and non-URL (raw base64) are returned as-is or normalized; only http(s) are fetched.
 * Avoids OpenAI timing out when downloading from external URLs (e.g. Supabase storage).
 */
export async function fetchImagesAsBase64(images: string[]): Promise<string[]> {
  const results = await Promise.all(
    images.map(async (img): Promise<string> => {
      if (!img || typeof img !== 'string') return img;
      if (img.startsWith('data:')) return img;
      if (!img.startsWith('http://') && !img.startsWith('https://')) {
        return img.includes(',') ? img : `data:image/jpeg;base64,${img}`;
      }
      const res = await axios.get(img, {
        responseType: 'arraybuffer',
        timeout: IMAGE_FETCH_TIMEOUT_MS,
        maxContentLength: MAX_CONTENT_LENGTH,
      });
      const base64 = Buffer.from(res.data).toString('base64');
      const contentType = res.headers['content-type'] || 'image/jpeg';
      return `data:${contentType};base64,${base64}`;
    }),
  );
  return results;
}
