// Her diary's way to the platform: signing in with Google, then her
// requests, her week and the times she blocks out (backend.sql), through the
// platform's client (../backend/). Every answer is { ok, data, error }; what
// she may see and change is decided on the platform, by her account (or its
// verified email address) being on her staff lists.

import { Backend } from "../backend/backend.js?v=3f7f76f11b9f";
import { shrinkPicture } from "../backend/pictures.js?v=3f7f76f11b9f";
import { drawGoogleButton } from "../backend/google.js?v=3f7f76f11b9f";

// public: the platform's address, its publishable key, and the Google client the platform accepts
const PLATFORM = "https://api.latent-sea.com";
const KEY = "sb_publishable_BqVtSYE4ysOb2sHMuFSwMk_HrTAUgLx";
const GOOGLE_CLIENT = "400837578052-jqnhh565es3a92k58u5r2oggdcf7mrkr.apps.googleusercontent.com";

const answer = (reply) => ({ ok: reply.ok, data: reply.data, error: reply.ok ? "" : reply.status === 0 ? "The platform can't be reached. Check the connection and try again." : reply.error });

export class Office {
  constructor(backend = new Backend(PLATFORM, KEY, { keptIn: "diary_session" })) {
    this.backend = backend;
    this.live = null;
  }

  restore() { return this.backend.restore(); }

  userId() { return this.backend.playerId(); }

  /** Google's sign-in button, drawn into this element: pressed, `signedIn` hears Google's answer. */
  drawGoogleButton(element, signedIn) { return drawGoogleButton(element, GOOGLE_CLIENT, signedIn); }

  async signInWithGoogle(credential, nonce) { return answer(await this.backend.signInWithGoogleToken(credential, nonce)); }

  async signOut() {
    this.stopListening();
    await this.backend.signOut();
  }

  /** Whether this account is hers, as the platform decides it: by its id, or by its verified email address. */
  async isHers() {
    const reply = await this.backend.callRpc("shivonne_dubarry_is_staff");
    return { ok: reply.ok, data: reply.ok && reply.data === true, error: answer(reply).error };
  }

  async settings() {
    const reply = answer(await this.backend.select("shivonne_dubarry_settings"));
    return { ...reply, data: reply.ok ? reply.data[0] ?? null : null };
  }

  /** Requests still to come, waiting or accepted, soonest first. */
  async requests() {
    return answer(await this.backend.select("shivonne_dubarry_requests", `status=neq.declined&ends=gte.${encodeURIComponent(new Date().toISOString())}&order=starts`));
  }

  async answerRequest(id, status) { return answer(await this.backend.update("shivonne_dubarry_requests", `id=eq.${encodeURIComponent(id)}`, { status })); }

  async week() { return answer(await this.backend.select("shivonne_dubarry_week", "order=weekday,starts")); }

  async addHours(weekday, starts, ends) { return answer(await this.backend.insert("shivonne_dubarry_week", { weekday, starts, ends })); }

  async removeHours(id) { return answer(await this.backend.delete("shivonne_dubarry_week", `id=eq.${encodeURIComponent(id)}`)); }

  /** Blocked times not yet over, soonest first. */
  async blocked() {
    return answer(await this.backend.select("shivonne_dubarry_blocked", `ends=gte.${encodeURIComponent(new Date().toISOString())}&order=starts`));
  }

  /** A time blocked out, as it reads on her clock ("2026-10-12T09:00"). */
  async block(startsLocal, endsLocal) { return answer(await this.backend.callRpc("shivonne_dubarry_block", { starts_local: startsLocal, ends_local: endsLocal })); }

  async unblock(id) { return answer(await this.backend.delete("shivonne_dubarry_blocked", `id=eq.${encodeURIComponent(id)}`)); }

  /** The site's words and pictures as she last saved them (null: never saved). */
  async page() { return answer(await this.backend.callRpc("shivonne_dubarry_page")); }

  /** The site's words and pictures saved, as the newest of her saves. */
  async savePage(content) { return answer(await this.backend.insert("shivonne_dubarry_pages", { content })); }

  /** A picture for the site uploaded into her folder, made small first: its path there, to save in the page. */
  async uploadPicture(which, file) {
    const name = `${which}-${crypto.randomUUID()}.jpg`;
    const reply = await this.backend.uploadPicture(name, await shrinkPicture(file, 1800));
    if (reply.status === 413) return { ok: false, data: null, error: "That picture is too big. Please choose one under 5 MB." };
    return { ...answer(reply), data: reply.ok ? `${this.userId()}/${name}` : null };
  }

  pictureAddress(path) { return this.backend.pictureAddress(path); }

  /** Told whenever a request comes, changes or goes. */
  listen(changed) {
    this.stopListening();
    this.live = this.backend.channel("diary").onChanges("shivonne_dubarry_requests");
    this.live.on("changed", changed);
    this.live.join();
  }

  stopListening() {
    this.live?.leave();
    this.live = null;
  }
}
