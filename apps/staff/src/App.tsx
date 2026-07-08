import { Route, Routes } from "react-router-dom";
import {
  Body,
  EmptyState,
  ManagerLayout,
  PageContainer,
  ThemeProvider,
} from "@koz/ui";

function FoundationShell() {
  return (
    <ThemeProvider>
      <ManagerLayout>
        <PageContainer>
          <EmptyState
            title="Staff foundation"
            description="Manager and admin layouts are ready for feature screens."
            action={
              <Body tone="muted">
                No business pages or API calls are implemented in this phase.
              </Body>
            }
          />
        </PageContainer>
      </ManagerLayout>
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
