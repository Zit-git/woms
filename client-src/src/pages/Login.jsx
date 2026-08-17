import { useEffect } from 'react';
import { embedSignIn } from '../lib/catalystClient';

export default function Login() {
  useEffect(() => {
    embedSignIn('catalyst-signin', window.location.origin + import.meta.env.BASE_URL + 'index.html');
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 360 }}>
        <h1 style={{ textAlign: 'center', marginBottom: 24 }}>WOMS</h1>
        <div id="catalyst-signin" />
      </div>
    </div>
  );
}
