import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import Navbar from "./components/Navbar";
import RequireLogin from "./components/RequireLogin";
import CreateTemplatePage from "./pages/CreateTemplatePage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import RankingPage from "./pages/RankingPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SettingsPage from "./pages/SettingsPage";
import TemplatePage from "./pages/TemplatePage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import { AuthProvider } from "./utils/auth";

// The share links the API builds are /templates/:id and /rankings/:id,
// so those two paths must stay as they are.
function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/templates/new" element={<RequireLogin><CreateTemplatePage /></RequireLogin>} />
          <Route path="/templates/:templateId" element={<TemplatePage />} />
          <Route path="/rankings/:rankingId" element={<RankingPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/settings" element={<RequireLogin><SettingsPage /></RequireLogin>} />
          <Route path="/notifications" element={<RequireLogin><NotificationsPage /></RequireLogin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
