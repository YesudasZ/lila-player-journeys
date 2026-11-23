import { Component, type ReactNode } from "react";

import { Centred, Crashed } from "./StatusMessage.tsx";

/**
 * Catches what is thrown while the page is drawn, so that a fault shows as a message and not as an
 * empty page. React writes the error itself to the console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Centred>
        <Crashed />
      </Centred>
    );
  }
}
