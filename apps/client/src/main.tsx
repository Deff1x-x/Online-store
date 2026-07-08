import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { FrontendApiProvider } from "@koz/api";
import "@koz/ui/styles.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FrontendApiProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </FrontendApiProvider>
  </React.StrictMode>,
);
