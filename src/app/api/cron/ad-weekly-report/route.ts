import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWeeklyAdReport } from "@/lib/notification-senders/ad-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const results = { sent: 0, skipped: 0, errors: 0 };

  // Get all advertisers with active ads
  const { data: advertisers } = await sb
    .from("advertiser_accounts")
    .select("id, email, name");

  if (!advertisers || advertisers.length === 0) {
    return NextResponse.json({ ok: true, ...results });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

  for (const advertiser of advertisers) {
    try {
      // Get advertiser's active ads
      const { data: ads } = await sb
        .from("sky_ads")
        .select("id, brand, text, active")
        .eq("advertiser_id", advertiser.id)
        .eq("active", true);

      if (!ads || ads.length === 0) {
        results.skipped++;
        continue;
      }

      const adIds = ads.map((a) => a.id);

      // Current week stats
      const { data: currentStats } = await sb
        .from("sky_ad_daily_stats")
        .select("ad_id, impressions, clicks, cta_clicks")
        .in("ad_id", adIds)
        .gte("day", sevenDaysAgo);

      // Previous week stats
      const { data: prevStats } = await sb
        .from("sky_ad_daily_stats")
        .select("ad_id, impressions, clicks, cta_clicks")
        .in("ad_id", adIds)
        .gte("day", fourteenDaysAgo)
        .lt("day", sevenDaysAgo);

      // Aggregate per ad
      const adTotals = new Map<string, { impressions: number; clicks: number }>();
      let totalImp = 0, totalClk = 0;

      for (const row of currentStats ?? []) {
        const cur = adTotals.get(row.ad_id) ?? { impressions: 0, clicks: 0 };
        const imp = Number(row.impressions);
        const clk = Number(row.clicks) + Number(row.cta_clicks);
        cur.impressions += imp;
        cur.clicks += clk;
        adTotals.set(row.ad_id, cur);
        totalImp += imp;
        totalClk += clk;
      }

      // Skip if zero impressions
      if (totalImp === 0) {
        results.skipped++;
        continue;
      }

      let prevImp = 0, prevClk = 0;
      for (const row of prevStats ?? []) {
        prevImp += Number(row.impressions);
        prevClk += Number(row.clicks) + Number(row.cta_clicks);
      }

      const adReports = ads.map((ad) => {
        const t = adTotals.get(ad.id) ?? { impressions: 0, clicks: 0 };
        return {
          brand: ad.brand || ad.text.slice(0, 30),
          impressions: t.impressions,
          clicks: t.clicks,
          ctr: t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) + "%" : "0%",
        };
      });

      await sendWeeklyAdReport({
        advertiserEmail: advertiser.email,
        advertiserName: advertiser.name,
        ads: adReports,
        totals: {
          impressions: totalImp,
          clicks: totalClk,
          ctr: totalImp > 0 ? ((totalClk / totalImp) * 100).toFixed(2) + "%" : "0%",
        },
        prevTotals: { impressions: prevImp, clicks: prevClk },
      });

      results.sent++;
    } catch (err) {
      console.error(`Failed to send weekly report to ${advertiser.email}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
