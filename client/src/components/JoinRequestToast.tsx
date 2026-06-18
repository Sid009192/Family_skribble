/**
 * JoinRequestToast.tsx — non-blocking notification shown to the host / admin
 * when someone wants to join an active game. Renders as a small card in the
 * top-right corner; each request has its own card so multiple can stack.
 *
 * Each card auto-dismisses after 30 seconds to match the server's timeout
 * (the server silently denies the request and notifies the requester — we
 * just need to clean up the card on the host's side).
 */

import { useEffect } from "react";
import type { IncomingJoinRequest } from "../useRoom";
import { Avatar } from "./Avatar";

const REQUEST_TTL_MS = 30_000;

interface Props {
  requests: IncomingJoinRequest[];
  onRespond: (requestId: string, approved: boolean) => void;
}

function ToastCard({
  req,
  onRespond,
}: {
  req: IncomingJoinRequest;
  onRespond: (requestId: string, approved: boolean) => void;
}) {
  // Auto-dismiss after 30s — matches the server's JOIN_REQUEST_TTL_MS.
  // The server already denied the request and told the requester; we just
  // remove the stale card from the host's UI.
  useEffect(() => {
    const t = setTimeout(() => onRespond(req.requestId, false), REQUEST_TTL_MS);
    return () => clearTimeout(t);
  }, [req.requestId, onRespond]);

  return (
    <div className="join-toast">
      <div className="join-toast-avatar">
        <Avatar avatar={req.avatar} size={32} />
      </div>
      <div className="join-toast-body">
        <span className="join-toast-name">{req.name}</span>
        <span className="join-toast-label">wants to join</span>
      </div>
      <div className="join-toast-actions">
        <button
          type="button"
          className="join-toast-btn approve"
          title="Approve"
          onClick={() => onRespond(req.requestId, true)}
        >
          ✓
        </button>
        <button
          type="button"
          className="join-toast-btn deny"
          title="Deny"
          onClick={() => onRespond(req.requestId, false)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function JoinRequestToast({ requests, onRespond }: Props) {
  if (requests.length === 0) return null;

  return (
    <div className="join-toast-stack">
      {requests.map((req) => (
        <ToastCard key={req.requestId} req={req} onRespond={onRespond} />
      ))}
    </div>
  );
}
