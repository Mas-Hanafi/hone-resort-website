import type { VercelRequest, VercelResponse } from '@vercel/node';

// Place ID for H One Resort (Pantai Contoh, Kabupaten Contoh)
const PLACE_ID = 'YOUR_GOOGLE_PLACE_ID';
const FALLBACK = { rating: 4.8, total: 101 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return res.status(200).json(FALLBACK);

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${PLACE_ID}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'rating,userRatingCount',
        },
      }
    );

    const data = await response.json();
    if (!data?.rating) return res.status(200).json(FALLBACK);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json({
      rating: data.rating,
      total: data.userRatingCount,
    });
  } catch {
    return res.status(200).json(FALLBACK);
  }
}
