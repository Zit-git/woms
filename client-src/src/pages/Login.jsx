export default function Login() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">WOMS</div>
        <div className="login-subtitle">Warehouse Operations Management System</div>
        <div className="login-widget" style={{ padding: '32px 16px', textAlign: 'center' }}>
          <p className="muted" style={{ marginTop: 0 }}>You need to sign in to continue.</p>
          <button className="btn" onClick={() => { window.location.href = '/__catalyst/auth/login'; }}>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
