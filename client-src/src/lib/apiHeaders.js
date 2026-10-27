// Headers every direct request to the data service must carry.
//
// On the Slate address a request under /baas/ is only passed on to the Catalyst service when it carries
// CATALYST-COMPONENT: true (Catalyst's web library adds it itself). Without it Slate answers with its own page
// (HTML for a read, "method not valid" for a write), and its cache keeps that wrong answer for everyone for a few
// minutes: one request without the header can break sign-in for all users. The legacy /app/ address does not need
// it, which is why this went unnoticed there.
export function csrfToken() {
  try {
    return (/(?:^|;\s*)ZD_CSRF_TOKEN=([^;]+)/.exec(document.cookie) || [])[1] || '';
  } catch {
    return '';
  }
}

export function apiHeaders(csrf = csrfToken()) {
  return {
    Accept: 'application/vnd.catalyst.v2+json',
    'CATALYST-COMPONENT': 'true',
    ...(csrf ? { 'X-ZCSRF-TOKEN': `zd_csrparam=${csrf}` } : {}),
  };
}
