import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, buildStatsTable, escapeHtml } from "@/lib/email-template";

interface AdReport {
  advertiserEmail: string;
  advertiserName: string | null;
  ads: {
    brand: string;
    impressions: number;
    clicks: number;
    ctr: string;
  }[];
  totals: {
    impressions: number;
    clicks: number;
    ctr: string;
  };
  prevTotals: {
    impressions: number;
    clicks: number;
  };
}

function pctLabel(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+100%" : "0%";
  const pct = ((current - prev) / prev) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export async function sendWeeklyAdReport(report: AdReport) {
  const resend = getResend();

  const topAd = report.ads.reduce((best, ad) =>
    ad.impressions > (best?.impressions ?? 0) ? ad : best, report.ads[0]);

  const impChange = pctLabel(report.totals.impressions, report.prevTotals.impressions);
  const clickChange = pctLabel(report.totals.clicks, report.prevTotals.clicks);

  const statsRows = [
    { label: `Impressions (${impChange} vs last week)`, value: report.totals.impressions.toLocaleString() },
    { label: `Clicks (${clickChange} vs last week)`, value: report.totals.clicks.toLocaleString() },
    { label: "Click-Through Rate", value: report.totals.ctr },
  ];

  if (topAd && report.ads.length > 1) {
    statsRows.push({ label: "Top Performing Ad", value: escapeHtml(topAd.brand) });
  }

  const bodyHtml = `
    <h2 style="margin-top: 0; font-family: 'Silkscreen', monospace; color: #111111;">
      Weekly Ad Report
    </h2>
    <p style="color: #555555; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6;">
      Here's how your Git City ads performed this week${report.advertiserName ? `, ${escapeHtml(report.advertiserName)}` : ""}.
    </p>
    ${buildStatsTable(statsRows)}
    ${buildButton("View Full Dashboard", "https://thegitcity.com/ads/dashboard")}
    <p style="margin-top: 24px; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 12px;">
      You're receiving this because you have active ads on Git City.
    </p>
  `;

  await resend.emails.send({
    from: "Git City <noreply@thegitcity.com>",
    to: report.advertiserEmail,
    subject: `Your Git City ads: ${report.totals.impressions.toLocaleString()} impressions this week`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
