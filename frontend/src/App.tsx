import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Auth } from "./pages/auth";
import Dashboard from "./pages/Dashboard";


export function App() {
  return(
 
  <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
  </BrowserRouter>
  );
}

export default App;
