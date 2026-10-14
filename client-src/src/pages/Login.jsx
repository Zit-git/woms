import { authRedirectUrl } from '../lib/catalystClient';

export default function Login() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">WOMS</div>
        <div className="login-subtitle">Warehouse Operations Management System</div>
        <div className="login-widget" style={{ padding: '32px 16px', textAlign: 'center' }}>
          <p className="muted" style={{ marginTop: 0 }}>You need to sign in to continue.</p>
          {/* Without service_url Catalyst sends people to the legacy /app/index.html after
              signing in, which doesn't exist on Slate (404). Passing where this build
              lives (Slate root, or /app/index.html for the legacy host) fixes both. */}
          <button className="btn" onClick={() => { window.location.href = `/__catalyst/auth/login?service_url=${encodeURIComponent(authRedirectUrl())}`; }}>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
