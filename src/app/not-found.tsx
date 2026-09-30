import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>Review not found</h1>
      <p>This link does not match a run in this instance.</p>
      <Link className="button" href="/">
        Back to reviews
      </Link>
    </div>
  );
}
