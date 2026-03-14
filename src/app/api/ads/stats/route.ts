import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { verifyApiKey } from "@/lib/advertiser-api-auth";

export const dynamic = "force-dynamic";

function getPeriodDays(period: string): number | null {
  switch (period) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "all": return null;
    default: return 30;
  }
}

async function getAdvertiserId(request: NextRequest): Promise<string | null> {
  // Try API key first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gc_ak_")) {
    return verifyApiKey(authHeader.slice(7));
  }
  // Fall back to cookie session
  const advertiser = await getAdvertiserFromCookies();
  return advertiser?.id ?? null;
}

export async function GET(request: NextRequest) {
  const advertiserId = await getAdvertiserId(request);
  if (!advertiserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const period = request.nextUrl.searchParams.get("period") ?? "30d";
  const filterAdId = request.nextUrl.searchParams.get("ad_id");
  const days = getPeriodDays(period);

  // Get advertiser's ads
  const { data: ads } = await sb
    .from("sky_ads")
    .select("id, brand, text, description, color, bg_color, vehicle, active, priority, plan_id, starts_at, ends_at, created_at, link")
    .eq("advertiser_id", advertiserId);

  if (!ads || ads.length === 0) {
    return NextResponse.json({
      ads: [],
      totals: { impressions: 0, clicks: 0, cta_clicks: 0, ctr: "0.00%" },
      daily: [],
    });
  }

  const adIds = ads.map((a) => a.id);

  // Query stats from materialized view
  // The view has rows per (ad_id, day, country, device), so row counts can
  // be much higher than just ad_id x day. Supabase defaults to 1000 rows,
  // which silently truncates results and makes period filtering look broken.
  const queryAdIds = filterAdId && adIds.includes(filterAdId) ? [filterAdId] : adIds;
  let query = sb.from("sky_ad_daily_stats").select("ad_id, day, impressions, clicks, cta_clicks").in("ad_id", queryAdIds).limit(50000);
  if (days) {
    const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    query = query.gte("day", since);
  }
  const { data: stats } = await query;

  // Previous period for comparison
  let prevStats: typeof stats = [];
  if (days) {
    const prevSince = new Date(Date.now() - days * 2 * 86400000).toISOString().split("T")[0];
    const prevUntil = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    const { data } = await sb
      .from("sky_ad_daily_stats")
      .select("ad_id, day, impressions, clicks, cta_clicks")
      .in("ad_id", queryAdIds)
      .gte("day", prevSince)
      .lt("day", prevUntil)
      .limit(50000);
    prevStats = data ?? [];
  }

  // Aggregate per ad
  const adStats = new Map<string, { impressions: number; clicks: number; cta_clicks: number }>();
  const dailyMap = new Map<string, { impressions: number; clicks: number }>();

  for (const row of stats ?? []) {
    const cur = adStats.get(row.ad_id) ?? { impressions: 0, clicks: 0, cta_clicks: 0 };
    cur.impressions += Number(row.impressions);
    cur.clicks += Number(row.clicks);
    cur.cta_clicks += Number(row.cta_clicks);
    adStats.set(row.ad_id, cur);

    const dayCur = dailyMap.get(row.day) ?? { impressions: 0, clicks: 0 };
    dayCur.impressions += Number(row.impressions);
    dayCur.clicks += Number(row.clicks) + Number(row.cta_clicks);
    dailyMap.set(row.day, dayCur);
  }

  // Previous period totals
  let prevTotals = { impressions: 0, clicks: 0, cta_clicks: 0 };
  for (const row of prevStats ?? []) {
    prevTotals.impressions += Number(row.impressions);
    prevTotals.clicks += Number(row.clicks);
    prevTotals.cta_clicks += Number(row.cta_clicks);
  }

  // Build response
  const totals = { impressions: 0, clicks: 0, cta_clicks: 0 };
  const adsResponse = ads.map((ad) => {
    const s = adStats.get(ad.id) ?? { impressions: 0, clicks: 0, cta_clicks: 0 };
    totals.impressions += s.impressions;
    totals.clicks += s.clicks;
    totals.cta_clicks += s.cta_clicks;

    const totalClicks = s.clicks + s.cta_clicks;
    return {
      ...ad,
      impressions: s.impressions,
      clicks: s.clicks,
      cta_clicks: s.cta_clicks,
      ctr: s.impressions > 0 ? ((totalClicks / s.impressions) * 100).toFixed(2) + "%" : "0.00%",
    };
  });

  const totalAllClicks = totals.clicks + totals.cta_clicks;
  const ctr = totals.impressions > 0 ? ((totalAllClicks / totals.impressions) * 100).toFixed(2) + "%" : "0.00%";

  // Percentage changes
  function pctChange(current: number, prev: number): number {
    if (prev === 0) return current > 0 ? 100 : 0;
    return ((current - prev) / prev) * 100;
  }

  const daily = Array.from(dailyMap.entries())
    .map(([day, d]) => ({ day, ...d }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json(
    {
      ads: adsResponse,
      totals: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        cta_clicks: totals.cta_clicks,
        ctr,
        changes: {
          impressions: pctChange(totals.impressions, prevTotals.impressions),
          clicks: pctChange(totals.clicks, prevTotals.clicks),
          cta_clicks: pctChange(totals.cta_clicks, prevTotals.cta_clicks),
        },
      },
      daily,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
