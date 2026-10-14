import { useEffect, useState } from 'react';
import { embedSignIn, authReturnPath, authRedirectUrl, readAuthIssue } from '../lib/catalystClient';
import { useAuth } from '../context/AuthContext';

// If this screen keeps being loaded again and again (sign-in succeeds on Catalyst's side but
// the app doesn't see a session, so it redirects back here), stop embedding the form -- which
// is what triggers the next redirect -- and show the evidence instead of looping forever.
const MOUNTS_KEY = 'woms.loginMounts';
const LOOP_WINDOW_MS = 60 * 1000;
const LOOP_LIMIT = 4;
function recordMountAndDetectLoop() {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem(MOUNTS_KEY)) || []).filter((t) => now - t < LOOP_WINDOW_MS);
    recent.push(now);
    sessionStorage.setItem(MOUNTS_KEY, JSON.stringify(recent));
    return recent.length >= LOOP_LIMIT;
  } catch {
    return false;
  }
}
function clearLoopRecord() {
  try {
    sessionStorage.removeItem(MOUNTS_KEY);
  } catch {
    // nothing to clear
  }
}

// What the browser and Catalyst each think about the session, in plain text, so a
// "signed in but back at the login screen" report comes with its own evidence.
async function runSessionCheck() {
  const lines = [`Page: ${window.location.href}`, `Came from: ${document.referrer || '(none)'}`];
  const sdk = window.catalyst;
  lines.push(`Last app sign-in problem: ${readAuthIssue() || '(none recorded)'}`);
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

// Sign-in uses Catalyst's full-page sign-in. The form embedded in this card is only an
// optional alternative: after a successful embedded sign-in the browser tries to load the
// app *inside* that frame, which some browsers (Firefox) refuse, leaving a reload loop
// that never reaches the home screen. The full-page flow has no frame to be blocked.
export default function Login() {
  const { authError } = useAuth();
  const [report, setReport] = useState('');
  const [checking, setChecking] = useState(false);
  const [looping, setLooping] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const hostedUrl = `/__catalyst/auth/login?service_url=${encodeURIComponent(authRedirectUrl())}`;

  const check = () => {
    setChecking(true);
    runSessionCheck()
      .then(setReport)
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    if (recordMountAndDetectLoop()) {
      setLooping(true);
      check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The embedded form is only drawn when someone asks for it.
  useEffect(() => {
    if (showForm && !looping) embedSignIn('catalyst-signin', authReturnPath());
  }, [showForm, looping]);

  const tryAgain = () => {
    clearLoopRecord();
    window.location.reload();
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">WOMS</div>
        <div className="login-subtitle">Warehouse Operations Management System</div>
        {looping ? (
          <div className="login-widget" style={{ padding: '24px 16px', textAlign: 'center' }}>
            <p style={{ marginTop: 0 }}>
              <strong>The sign-in keeps coming back to this page.</strong>
            </p>
            <p className="muted small">
              Catalyst accepted the sign-in but the app could not see the session. The details below show why. Please send them to the
              development team.
            </p>
            <button className="btn" onClick={tryAgain}>
              Try again
            </button>
          </div>
        ) : showForm ? (
          <div className="login-widget">
            <div id="catalyst-signin" />
          </div>
        ) : (
          <div className="login-widget" style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ marginTop: 0 }}>Sign in with your WOMS account.</p>
            <a className="btn" href={hostedUrl}>
              Sign in
            </a>
          </div>
        )}
        {authError && (
          <p className="error-text" style={{ textAlign: 'center', marginTop: 12 }}>
            Last sign-in problem: {authError}
          </p>
        )}
        <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
          {showForm ? (
            <button className="link-btn" style={{ color: '#bcd2ff', fontSize: 'inherit' }} onClick={() => setShowForm(false)}>
              Back to the full-page sign-in
            </button>
          ) : (
            <button className="link-btn" style={{ color: '#bcd2ff', fontSize: 'inherit' }} onClick={() => setShowForm(true)}>
              Use the form in this page instead
            </button>
          )}
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
