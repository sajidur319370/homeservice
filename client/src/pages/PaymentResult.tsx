import { Link, useParams } from "react-router";

const MESSAGES: Record<string, { title: string; text: string; tone: string }> = {
  success: { title: "✅ Payment successful", text: "Your booking is confirmed.", tone: "alert-ok" },
  refund: {
    title: "💸 Payment received, refund pending",
    text: "Sorry, that time was taken before your payment arrived. We'll refund you.",
    tone: "",
  },
  failed: { title: "❌ Payment failed", text: "No money was taken. You can try again from My bookings.", tone: "alert-error" },
  cancelled: { title: "Payment cancelled", text: "You can pay later from My bookings while the hold lasts.", tone: "" },
};

export default function PaymentResult() {
  const { result = "failed" } = useParams();
  const m = MESSAGES[result] ?? MESSAGES.failed!; // unknown result → treat as failed

  return (
    <div className="card narrow stack">
      <h1>{m.title}</h1>
      <p className={`alert ${m.tone}`}>{m.text}</p>
      <Link to="/bookings" className="btn btn-primary">
        Go to My bookings
      </Link>
    </div>
  );
}
