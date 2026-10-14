import { useEffect } from 'react';
import { embedSignIn, authReturnPath, authRedirectUrl } from '../lib/catalystClient';

// Sign-in happens right here in the page: Catalyst's own form is embedded in the
// card, and on success it returns to authReturnPath() -- the Slate root, or
// /app/index.html on the legacy host.
export default function Login() {
  useEffect(() => {
    embedSignIn('catalyst-signin', authReturnPath());
  }, []);

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
        </p>
      </div>
    </div>
  );
}
