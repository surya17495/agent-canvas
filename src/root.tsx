import {
  Links,
  Meta,
  MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./tailwind.css";
import "./index.css";
import React from "react";
import { Toaster } from "react-hot-toast";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useConfig } from "#/hooks/query/use-config";
import { AgentServerUIRoot } from "#/components/providers";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body data-agent-server-ui="" style={{ margin: 0 }}>
        <AgentServerUIRoot contentClassName="min-h-screen">
          {children}
          <Toaster />
          <TelemetryConsentBanner />
          <div id="modal-portal-exit" />
        </AgentServerUIRoot>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AgentServerBootstrapLoading() {
  return (
    <main className="min-h-screen bg-base px-6 py-10 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-neutral-900/80 px-8 py-10 shadow-2xl">
          <LoadingSpinner size="large" />
        </div>
      </div>
    </main>
  );
}

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

export default function App() {
  const config = useConfig();

  if (config.isPending || config.isLoading) {
    return <AgentServerBootstrapLoading />;
  }

  return <Outlet />;
}
