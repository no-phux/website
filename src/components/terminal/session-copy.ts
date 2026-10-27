// What the hosted terminal says when a session falls back to the edge shell,
// closes, or errors. Split from PhuxTerminal.tsx, which owns the lifecycle.
import type { HostedEvent, SessionFallbackReason } from "./core";

export const fallbackCopy: Record<SessionFallbackReason, string> = {
  "auth-required":
    "Sign in to unlock native Linux. This session uses the edge shell.",
  "account-concurrency":
    "Your native shell is already active. This session uses edge.",
  "hourly-quota": "Six native launches used this hour. Edge remains available.",
  "daily-quota": "Thirty native minutes used today. Edge remains available.",
  "native-capacity":
    "Native capacity is full. This session uses the edge shell.",
  "ip-capacity":
    "A native shell is active on this network. This session uses edge.",
  "native-disabled":
    "Native shells are paused. The edge shell is still online.",
  "native-unhealthy": "Native startup is recovering. The edge shell is online.",
  "startup-timeout": "Native startup timed out. The edge shell took over.",
  "startup-failed": "Native startup failed safely. The edge shell took over.",
};

export const closeCopy: Record<
  Extract<HostedEvent, { type: "close" }>["category"],
  string
> = {
  normal: "The shell exited. Launch again for a fresh session.",
  "going-away": "The server is restarting. Try a fresh session shortly.",
  protocol:
    "The terminal connection was not compatible. Reload the page and try again.",
  server: "The shell stopped unexpectedly. Try a fresh session.",
  unavailable:
    "Hosted shells are temporarily unavailable. Please try again shortly.",
  capacity:
    "All hosted slots are busy. Release any other demo sessions, or try again shortly.",
  "rate-limited":
    "Too many launches in a short time. Wait a little before trying again.",
  "bad-request":
    "The server could not accept this session. Reload the page and try again.",
  idle: "This idle shell was released automatically. Launch again when you are ready.",
  expired:
    "This disposable session reached its time limit. Launch again for a fresh shell.",
  unauthorized:
    "Native access expired. Sign in again, or choose the no-sign-in edge shell.",
  network:
    "The connection was lost. Check your network and try a fresh session.",
};

export const errorCopy: Record<
  Extract<HostedEvent, { type: "error" }>["category"],
  string
> = {
  protocol:
    "The terminal received an incompatible response. Reload the page and try again.",
  client:
    "The terminal could not read the server response. Reload the page and try again.",
  transport:
    "The connection failed. Check your network; hosted capacity may also be temporarily unavailable.",
};
