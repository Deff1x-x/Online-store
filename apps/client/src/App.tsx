import { Route, Routes } from "react-router-dom";
import {
  Body,
  ClientLayout,
  EmptyState,
  H1,
  PageContainer,
  ThemeProvider,
} from "@koz/ui";

function FoundationShell() {
  return (
    <ThemeProvider>
      <ClientLayout>
        <PageContainer>
          <EmptyState
            title="Frontend foundation"
            description="Client app is ready for feature screens."
            action={
              <Body tone="muted">
                UI tokens, layouts, and shared components are loaded.
              </Body>
            }
          />
        </PageContainer>
      </ClientLayout>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<FoundationShell />} />
    </Routes>
  );
}
