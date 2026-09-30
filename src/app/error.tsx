"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>This page could not be loaded</h2>
      <p>Check database connectivity and configuration, then try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
