import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { FrontendApiProvider } from "@koz/api";
import "@koz/ui/styles.css";
import App from "./App";
import { requestPaywall } from "./paywall/paywall-context";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FrontendApiProvider onSubscriptionError={requestPaywall}>
      <BrowserRouter
        future={{
          v7_relativeSplatPath: true,
          v7_startTransition: true,
        }}
      >
        <App />
      </BrowserRouter>
    </FrontendApiProvider>
  </React.StrictMode>,
);
