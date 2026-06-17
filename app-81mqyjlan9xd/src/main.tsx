import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import 'reactflow/dist/style.css';
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { PasswordGate } from "./components/common/PasswordGate.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppWrapper>
      <PasswordGate>
        <App />
      </PasswordGate>
    </AppWrapper>
  </StrictMode>
);
