import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MenuPage from "./pages/MenuPage";
import ToolPage from "./pages/ToolPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/tool/:toolId" element={<ToolPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
