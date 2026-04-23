import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing        from "./pages/Landing";
import Login          from "./pages/Login";
import Dashboard      from "./pages/Dashboard";
import BookTickets    from "./pages/BookTickets";
import MyBookings     from "./pages/MyBookings";
import PnrStatus      from "./pages/PnrStatus";
import JourneyPlanner from "./pages/JourneyPlanner";
import LiveTrainStatus from "./pages/LiveTrainStatus";
import PlatformAlerts from "./pages/PlatformAlerts";
import ProtectedRoute from "./components/ProtectedRoute";
import { ToastProvider } from "./components/ToastProvider";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"      element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/pnr-status" element={<PnrStatus />} />
          <Route path="/journey-planner" element={<JourneyPlanner />} />
          <Route path="/live-status" element={<LiveTrainStatus />} />
          <Route path="/platform-alerts" element={<PlatformAlerts />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/book"
            element={
              <ProtectedRoute>
                <BookTickets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <ProtectedRoute>
                <MyBookings />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
