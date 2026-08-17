import { useEffect } from 'react';
import { embedSignIn } from '../lib/catalystClient';

export default function Login() {
  useEffect(() => {
    embedSignIn('catalyst-signin', window.location.origin + import.meta.env.BASE_URL + 'index.html');
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
