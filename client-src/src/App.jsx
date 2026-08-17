import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './layout/AppShell';
import Login from './pages/Login';
import DashboardHome from './pages/DashboardHome';
import PlaceholderModule from './pages/PlaceholderModule';
import CustomerList from './pages/customers/CustomerList';
import WarehouseConfig from './pages/warehouse/WarehouseConfig';
import InboundAdviceList from './pages/inbound/InboundAdviceList';
import InboundAdviceDetail from './pages/inbound/InboundAdviceDetail';
import OutboundRequestList from './pages/outbound/OutboundRequestList';
import OutboundRequestDetail from './pages/outbound/OutboundRequestDetail';

function Gate() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardHome />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="warehouse" element={<WarehouseConfig />} />
        <Route path="inbound" element={<InboundAdviceList />} />
        <Route path="inbound/:adviceId" element={<InboundAdviceDetail />} />
        <Route path="cargo-storage" element={<PlaceholderModule title="Cargo & Storage Management" />} />
        <Route path="qr-labels" element={<PlaceholderModule title="QR Code & Label Management" />} />
        <Route path="tasks" element={<PlaceholderModule title="Operational Task Management" />} />
        <Route path="val" element={<PlaceholderModule title="Value Added Logistics" />} />
        <Route path="outbound" element={<OutboundRequestList />} />
        <Route path="outbound/:requestId" element={<OutboundRequestDetail />} />
        <Route path="reports" element={<PlaceholderModule title="Reports & Dashboards" />} />
        <Route path="admin" element={<PlaceholderModule title="System Administration" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
