import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './layout/AppShell';
import Login from './pages/Login';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';

const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const CustomerDetail = lazy(() => import('./pages/customers/CustomerDetail'));
const TransportersPage = lazy(() => import('./pages/transporters/TransportersPage'));
const WarehouseConfig = lazy(() => import('./pages/warehouse/WarehouseConfig'));
const InboundAdviceList = lazy(() => import('./pages/inbound/InboundAdviceList'));
const InboundMaster = lazy(() => import('./pages/inbound/InboundMaster'));
const InboundWizard = lazy(() => import('./pages/inbound/InboundWizard'));
const StoragePage = lazy(() => import('./pages/storage/StoragePage'));
const DeliveryPage = lazy(() => import('./pages/delivery/DeliveryPage'));
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

function NoAccess({ title = 'No access', message }) {
  return (
    <div className="card" style={{ maxWidth: 520, margin: '60px auto' }}>
      <h2>{title}</h2>
      <p className="muted">{message}</p>
    </div>
  );
}

function Guarded({ module, children }) {
  const { canAccessModule } = useAuth();
  return canAccessModule(module) ? children : <NoAccess message="Your role does not include this area. Ask an administrator if you need it." />;
}

function Gate() {
  const { isAuthenticated, loading, hasActiveRole, clearSession } = useAuth();

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Login />;
  }
  if (!hasActiveRole) {
    return (
      <div style={{ padding: 24 }}>
        <NoAccess
          title="Your account has no role yet"
          message="You are signed in, but no active role is assigned to this account. Ask a System Administrator to assign one, then reload."
        />
        <div style={{ textAlign: 'center' }}>
          <button className="btn secondary" onClick={clearSession}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <ChunkErrorBoundary>
    <Routes>
      <Route
        path="/print/inbound/:adviceId"
        element={
          <Guarded module="Inbound Operations">
            <Suspense fallback={<PageLoading />}>
              <InboundPrint />
            </Suspense>
          </Guarded>
        }
      />
      <Route
        path="/print/grn/:adviceId"
        element={
          <Guarded module="Inbound Operations">
            <Suspense fallback={<PageLoading />}>
              <InboundPrint />
            </Suspense>
          </Guarded>
        }
      />
      <Route
        path="/print/outbound/:requestId"
        element={
          <Guarded module="Outbound Operations">
            <Suspense fallback={<PageLoading />}>
              <OutboundPrint />
            </Suspense>
          </Guarded>
        }
      />
      <Route
        path="/print/putaway/:adviceId"
        element={
          <Guarded module="Inbound Operations">
            <Suspense fallback={<PageLoading />}>
              <PutawayPrint />
            </Suspense>
          </Guarded>
        }
      />
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardHome />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:customerId" element={<CustomerDetail />} />
        <Route path="transporters" element={<TransportersPage />} />
        <Route path="warehouse" element={<WarehouseConfig />} />
        <Route path="inbound" element={<InboundAdviceList />} />
        <Route path="inbound/:adviceId" element={<InboundMaster />} />
        <Route path="inbound/:adviceId/wizard" element={<InboundWizard />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="outbound" element={<OutboundRequestList />} />
        <Route path="outbound/:requestId" element={<OutboundRequestDetail />} />
        <Route path="delivery" element={<DeliveryPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="val" element={<ValPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="cargo/:cargoId" element={<CargoDetail />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </ChunkErrorBoundary>
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
