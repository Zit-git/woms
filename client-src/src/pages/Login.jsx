import { useEffect } from 'react';
import { embedSignIn, authRedirectUrl } from '../lib/catalystClient';

export default function Login() {
  useEffect(() => {
    embedSignIn('catalyst-signin', authRedirectUrl());
  }, []);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">WOMS</div>
        <div className="login-subtitle">Warehouse Operations Management System</div>
        <div className="login-widget">
          <div id="catalyst-signin" />
        </div>
      </div>
    </div>
  );
}
