// Where bookings go: her tables on the platform (backend.sql), through the
// platform's client (backend/, installed by tooling/install_site.py). The
// page asks the desk for her free times and hands it a request; what a
// visitor may see or do is decided on the platform, not here.

import { Backend } from "./backend/backend.js";

// public: the platform's address and its publishable key belong in the page
const PLATFORM = "https://api.latent-sea.com";
const KEY = "sb_publishable_BqVtSYE4ysOb2sHMuFSwMk_HrTAUgLx";

export class Desk {
  constructor(backend = new Backend(PLATFORM, KEY)) {
    this.backend = backend;
  }

  /** Her free times, soonest first: { ok, times: [{ at, ends }], error }. */
  async openings() {
    const reply = await this.backend.callRpc("shivonne_dubarry_openings");
    if (!reply.ok) return { ok: false, times: [], error: unreachable(reply) };
    return { ok: true, times: reply.data.map((slot) => ({ at: new Date(slot.starts), ends: new Date(slot.ends) })), error: "" };
  }

  /**
   * A request for a time, as a guest of the platform:
   * { ok, taken (the time went meanwhile), error }.
   */
  async request({ session, at, name, email, phone }) {
    if (!(await this.backend.restore())) {
      const signed = await this.backend.signInAnonymously();
      if (!signed.ok) return { ok: false, taken: false, error: unreachable(signed) };
    }
    const reply = await this.backend.insert("shivonne_dubarry_requests", { session, starts: at.toISOString(), name, email, phone });
    if (reply.ok) return { ok: true, taken: false, error: "" };
    const taken = /no longer free|requests_hold/.test(reply.error);
    if (taken) return { ok: false, taken, error: "That time has just been taken. Please choose another." };
    if (/already have a request/.test(reply.error)) return { ok: false, taken, error: "You already have a request waiting for her reply." };
    return { ok: false, taken, error: unreachable(reply) };
  }
}

function unreachable(reply) {
  return reply.status === 0 ? "The booking service can't be reached. Please check your connection and try again." : "Something went wrong on our side. Please try again in a moment.";
}
