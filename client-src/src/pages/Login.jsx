import { useEffect, useState } from 'react';
import { embedSignIn, authReturnPath, authRedirectUrl } from '../lib/catalystClient';

// What the browser and Catalyst each think about the session, in plain text, so a
// "signed in but back at the login screen" report comes with its own evidence.
async function runSessionCheck() {
  const lines = [`Page: ${window.location.href}`, `Came from: ${document.referrer || '(none)'}`];
  const sdk = window.catalyst;
  if (!sdk) return [...lines, 'Catalyst SDK did not load.'].join('\n');
  try {
    const r = await sdk.userManagement.getCurrentProjectUser();
    lines.push(`Project user: SIGNED IN as ${r?.content?.email_id}`);
  } catch (e) {
    lines.push(`Project user: NOT SIGNED IN (${e?.status ?? e?.statusCode ?? ''} ${e?.message || e?.error || JSON.stringify(e)})`);
  }
  try {
    const r = await sdk.auth.isUserAuthenticated();
    lines.push(`isUserAuthenticated: yes (${r?.content?.email_id})`);
  } catch (e) {
    lines.push(`isUserAuthenticated: no (${e?.status ?? e?.statusCode ?? ''} ${e?.message || e?.error || ''})`);
  }
  // The SDK reports every failure as a vague "network issue"; ask the same endpoint directly for the real status.
  const seen = performance.getEntriesByType('resource').find((e) => e.name.includes('/project-user/current'));
  if (seen) {
    try {
      const res = await fetch(seen.name.split('?')[0], { credentials: 'include' });
      const body = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
      lines.push(`GET project-user/current -> HTTP ${res.status} ${body}`);
    } catch (e) {
      lines.push(`GET project-user/current failed: ${e?.message || e}`);
    }
  }
  const names = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
  lines.push(`Cookies visible to the page: ${names.length ? names.join(', ') : '(none)'}`);
  lines.push('(HttpOnly session cookies are hidden from the page by design.)');
  return lines.join('\n');
}

// Sign-in happens right here in the page: Catalyst's own form is embedded in the
// card, and on success it returns to authReturnPath() -- the Slate root, or
// /app/index.html on the legacy host.
export default function Login() {
  const [report, setReport] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    embedSignIn('catalyst-signin', authReturnPath());
  }, []);

  const check = () => {
    setChecking(true);
    runSessionCheck()
      .then(setReport)
      .finally(() => setChecking(false));
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">WOMS</div>
        <div className="login-subtitle">Warehouse Operations Management System</div>
        <div className="login-widget">
          <div id="catalyst-signin" />
        </div>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
          Form not loading?{' '}
          <a href={`/__catalyst/auth/login?service_url=${encodeURIComponent(authRedirectUrl())}`}>Use the Catalyst sign-in page</a>
          <br />
          Signed in but back here?{' '}
          <button className="link-btn" style={{ color: '#bcd2ff', fontSize: 'inherit' }} onClick={check} disabled={checking}>
            {checking ? 'Checking...' : 'Run a session check'}
          </button>
        </p>
        {report && (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#dbe6ff', background: 'rgba(255,255,255,0.08)', padding: 12, borderRadius: 8, margin: '12px 0 0' }}>
            {report}
          </pre>
        )}
      </div>
    </div>
  );
}
