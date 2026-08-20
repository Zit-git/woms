import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './layout/AppShell';
import Login from './pages/Login';
import DashboardHome from './pages/DashboardHome';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';
import TransportersPage from './pages/transporters/TransportersPage';
import WarehouseConfig from './pages/warehouse/WarehouseConfig';
import InboundAdviceList from './pages/inbound/InboundAdviceList';
import InboundAdviceDetail from './pages/inbound/InboundAdviceDetail';
import StoragePage from './pages/storage/StoragePage';
import OutboundRequestList from './pages/outbound/OutboundRequestList';
import OutboundRequestDetail from './pages/outbound/OutboundRequestDetail';
import TasksPage from './pages/tasks/TasksPage';
import ValPage from './pages/val/ValPage';
import ReportsPage from './pages/reports/ReportsPage';
import CargoDetail from './pages/reports/CargoDetail';
import AdminPage from './pages/admin/AdminPage';
import SettingsPage from './pages/settings/SettingsPage';
import InboundPrint from './pages/print/InboundPrint';
import OutboundPrint from './pages/print/OutboundPrint';
import PutawayPrint from './pages/print/PutawayPrint';

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
      <Route path="/print/inbound/:adviceId" element={<InboundPrint />} />
      <Route path="/print/outbound/:requestId" element={<OutboundPrint />} />
      <Route path="/print/putaway/:adviceId" element={<PutawayPrint />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardHome />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:customerId" element={<CustomerDetail />} />
        <Route path="transporters" element={<TransportersPage />} />
        <Route path="warehouse" element={<WarehouseConfig />} />
        <Route path="inbound" element={<InboundAdviceList />} />
        <Route path="inbound/:adviceId" element={<InboundAdviceDetail />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="outbound" element={<OutboundRequestList />} />
        <Route path="outbound/:requestId" element={<OutboundRequestDetail />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="val" element={<ValPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="cargo/:cargoId" element={<CargoDetail />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="settings" element={<SettingsPage />} />
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
