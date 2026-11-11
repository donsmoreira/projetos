import {
  StrictMode
} from "react";

import {
  createRoot
} from "react-dom/client";

import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";

import "./styles/global.css";

// App instalável: o service worker só entra na versão publicada
// (em desenvolvimento ele atrapalharia as atualizações automáticas da tela).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o sistema funciona igual; só não fica instalável em alguns celulares
    });
  });
}

createRoot(
  document.getElementById("root")!
).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);