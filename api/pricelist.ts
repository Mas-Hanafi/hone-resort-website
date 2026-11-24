import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/pricelist_periods?active=eq.true&order=sort_order.asc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) throw new Error(`Supabase error: ${response.status}`);

    const rows = await response.json();

    const periods = rows.map((row: any) => ({
      label: row.label,
      tag: row.tag,
      minCheckIn: row.min_check_in,
      maxCheckIn: row.max_check_in,
      sup_sv: row.sup_sv,
      sup_gv: row.sup_gv,
      dlx_sv: row.dlx_sv,
      dlx_gv: row.dlx_gv,
      suite_sv: row.suite_sv,
      checkInDates: row.check_in_dates ?? [],
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60'); // admin price edits live within ~1 min
    return res.status(200).json(periods);
  } catch (err) {
    console.error('[pricelist]', err);
    // Return empty — client falls back to hardcoded data
    return res.status(500).json({ error: 'Failed to fetch pricelist' });
  }
}
