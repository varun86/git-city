import { NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Get company
  const { data: company } = await admin
    .from("job_company_profiles")
    .select("id, last_dashboard_visit")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ company: null, listings: [] });
  }

  // Fetch listings + update last visit in parallel
  const [listingsRes] = await Promise.all([
    admin
      .from("job_listings")
      .select("id, company_id, title, status, seniority, role_type, location_type, contract_type, web_type, apply_url, view_count, apply_count, click_count, salary_min, salary_max, salary_currency, salary_period, expires_at, created_at, tier, rejection_reason")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    admin
      .from("job_company_profiles")
      .update({ last_dashboard_visit: new Date().toISOString() })
      .eq("id", company.id),
  ]);

  return NextResponse.json({
    company,
    listings: listingsRes.data ?? [],
    lastVisit: company.last_dashboard_visit,
  });
}
