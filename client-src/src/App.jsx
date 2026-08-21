import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './layout/AppShell';
import Login from './pages/Login';

const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const CustomerDetail = lazy(() => import('./pages/customers/CustomerDetail'));
const TransportersPage = lazy(() => import('./pages/transporters/TransportersPage'));
const WarehouseConfig = lazy(() => import('./pages/warehouse/WarehouseConfig'));
const InboundAdviceList = lazy(() => import('./pages/inbound/InboundAdviceList'));
const InboundWizard = lazy(() => import('./pages/inbound/InboundWizard'));
const StoragePage = lazy(() => import('./pages/storage/StoragePage'));
const OutboundRequestList = lazy(() => import('./pages/outbound/OutboundRequestList'));
const OutboundRequestDetail = lazy(() => import('./pages/outbound/OutboundRequestDetail'));
const TasksPage = lazy(() => import('./pages/tasks/TasksPage'));
const ValPage = lazy(() => import('./pages/val/ValPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const CargoDetail = lazy(() => import('./pages/reports/CargoDetail'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const InboundPrint = lazy(() => import('./pages/print/InboundPrint'));
const OutboundPrint = lazy(() => import('./pages/print/OutboundPrint'));
const PutawayPrint = lazy(() => import('./pages/print/PutawayPrint'));

const PageLoading = () => <div style={{ padding: 40 }}>Loading...</div>;

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
      <Route
        path="/print/inbound/:adviceId"
        element={
          <Suspense fallback={<PageLoading />}>
            <InboundPrint />
          </Suspense>
        }
      />
      <Route
        path="/print/outbound/:requestId"
        element={
          <Suspense fallback={<PageLoading />}>
            <OutboundPrint />
          </Suspense>
        }
      />
      <Route
        path="/print/putaway/:adviceId"
        element={
          <Suspense fallback={<PageLoading />}>
            <PutawayPrint />
          </Suspense>
        }
      />
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardHome />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:customerId" element={<CustomerDetail />} />
        <Route path="transporters" element={<TransportersPage />} />
        <Route path="warehouse" element={<WarehouseConfig />} />
        <Route path="inbound" element={<InboundAdviceList />} />
        <Route path="inbound/:adviceId" element={<InboundWizard />} />
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
    <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true }}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
