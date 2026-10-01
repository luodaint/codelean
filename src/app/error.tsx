"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>This page could not be loaded</h2>
      <p>
        Something went wrong. Try again, or reload the page if the problem
        continues.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
