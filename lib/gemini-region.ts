// Google’s available regions, excluding the EEA (including its outermost regions),
// Switzerland and the UK under the unpaid API terms. Reviewed 25 November 2026.
// https://ai.google.dev/gemini-api/docs/available-regions
// https://ai.google.dev/gemini-api/terms
// XK is the commonly used country code for Kosovo, which Google explicitly lists.
const freeGeminiCountries = new Set(`
AD AE AG AI AL AM AO AQ AR AS AU AW AZ BA BB BD BF BH BI BJ BL BM BN
BO BQ BR BS BT BW BZ CA CC CD CF CG CI CK CL CM CO CR CV CW CX DJ DM
DO DZ EC EG EH ER ET FJ FK FM FO GA GD GE GG GH GI GL GM GN GQ GS GT
GU GW GY HM HN HT ID IL IM IN IO IQ JE JM JO JP KE KG KH KI KM KN KR
KW KY KZ LA LB LC LK LR LS LY MA MC MD ME MG MH MK ML MN MP MR MS MU
MV MW MX MY MZ NA NC NE NF NG NI NP NR NU NZ OM PA PE PG PH PK PM PN
PR PS PW PY QA RS RW SA SB SC SD SG SH SL SM SN SO SR SS ST SV SY SZ
TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC
VE VG VI VN VU WF WS XK YE ZA ZM ZW
`.trim().split(/\s+/))

const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

export function canUseFreeGemini(request: Request): boolean {
  // https://vercel.com/docs/headers/request-headers#x-vercel-ip-country
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    const hosted = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
    return process.env.VERCEL === "1" && hosted
      && freeGeminiCountries.has(request.headers.get("x-vercel-ip-country") ?? "")
  }

  // A production build running on localhost must explicitly opt into local QA.
  const localTesting = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    || process.env.GEMINI_LOCAL_TESTING === "1"
  const host = new URL(request.url).host
  return localTesting && loopbackHost.test(host) && loopbackHost.test(request.headers.get("host") ?? host)
}
