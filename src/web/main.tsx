import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles/tokens.css";
import "./styles/themes/feylore.css";
import { ThemeProvider } from "./theme/ThemeProvider";
import { InstanceProvider } from "./app/instance-context";
import { AppRouter } from "./app/router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InstanceProvider>
      <ThemeProvider>
        <AppRouter />
      </ThemeProvider>
    </InstanceProvider>
  </StrictMode>,
);
