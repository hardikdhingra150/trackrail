import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../lib/firebase";
import { cancelBooking, getUserBookings } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import type { Booking } from "../types";

export default function MyBookings() {
  const [user] = useAuthState(auth);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!user) return;
    getUserBookings(user.uid)
      .then(setBookings)
      .catch((error) => {
        console.error(error);
        showToast("Could not load bookings", "error", "Please refresh the page");
      })
      .finally(() => setLoading(false));
  }, [user, showToast]);

  const handleCancel = async (booking: Booking) => {
    setCancelling(booking.id);
    try {
      const refundAmount = Math.round(booking.totalFare * 0.85);
      await cancelBooking(booking.id, refundAmount);
      setBookings((prev) => prev.map((item) => item.id === booking.id
        ? { ...item, status: "CANCELLED", refundAmount }
        : item));
      showToast("Ticket cancelled", "info", `Refund initiated: ₹${refundAmount}`);
    } catch (error) {
      console.error(error);
      showToast("Cancellation failed", "error", "Please try again later");
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: "#06080d" }}>
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/35 font-bold mb-2">Passenger Workspace</p>
            <h1 className="text-white font-extrabold tracking-tight" style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>
              My Bookings
            </h1>
            <p className="text-sm text-white/45 mt-2">Track active tickets, class, fare, PNR, and cancellations from one place.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/book" className="px-4 py-2 rounded-full text-black font-bold bg-white">Book Another</Link>
            <Link to="/pnr-status" className="px-4 py-2 rounded-full text-white/75 font-bold bg-white/5 border border-white/10">PNR Status</Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[24px] p-6 border border-white/10 bg-white/4 text-white/40">Loading bookings…</div>
        ) : bookings.length === 0 ? (
          <div className="rounded-[24px] p-8 border border-dashed border-white/10 bg-white/4 text-center">
            <p className="text-white font-bold text-lg">No tickets booked yet</p>
            <p className="text-white/40 mt-2">Create your first SIH demo booking to start building a travel history.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-[24px] p-5 border border-white/10 bg-white/4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white font-extrabold text-lg">{booking.trainName}</p>
                    <p className="text-white/45 text-sm mt-1">{booking.trainNumber} · {booking.fromStation} → {booking.toStation}</p>
                  </div>
                  <span
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{
                      background: booking.status === "CONFIRMED" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      color: booking.status === "CONFIRMED" ? "#4ade80" : "#f87171",
                    }}
                  >
                    {booking.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-2xl p-3 bg-white/4 border border-white/8">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold">PNR</p>
                    <p className="text-white font-extrabold mt-2">{booking.pnr}</p>
                  </div>
                  <div className="rounded-2xl p-3 bg-white/4 border border-white/8">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold">Fare</p>
                    <p className="text-white font-extrabold mt-2">₹{booking.totalFare}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl p-4 bg-white/4 border border-white/8">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/30 font-bold mb-3">Passengers</p>
                  <div className="flex flex-col gap-2">
                    {booking.passengers.map((passenger) => (
                      <div key={`${booking.id}-${passenger.idNumber}`} className="flex items-center justify-between text-sm">
                        <span className="text-white/75">{passenger.name} · {passenger.gender} · {passenger.age}</span>
                        <span className="text-white font-semibold">{passenger.seatNumber ?? "TBD"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-white/40">
                    Travel date: <span className="text-white/70">{booking.travelDate}</span>
                  </div>
                  {booking.status === "CONFIRMED" ? (
                    <button
                      onClick={() => handleCancel(booking)}
                      disabled={cancelling === booking.id}
                      className="px-4 py-2 rounded-full text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/20"
                    >
                      {cancelling === booking.id ? "Cancelling..." : "Cancel Ticket"}
                    </button>
                  ) : (
                    <span className="text-sm text-white/35">Refund: ₹{booking.refundAmount ?? 0}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
