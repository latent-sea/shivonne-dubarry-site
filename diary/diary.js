// Shivonne's diary: her private page. She signs in with Google; then she
// sees the requests visitors make, as they come, and accepts or declines
// each; sets the hours she works, week by week; and blocks out times. Every
// time is shown and typed on her clock (her time zone, in backend.sql's
// settings). Anyone else who signs in is told the account isn't set up, and
// shown its id: the id that, put in shivonne_dubarry_staff, makes an account
// hers.

import { ChimeApp, Chimes, Controller, Look, Phrase } from "../gd_chime/gd_chime.js?v=76699891b1bf";
import { SESSIONS } from "../content.js?v=76699891b1bf";
import { DARK, LIGHT } from "../palette.js?v=76699891b1bf";
import { Office } from "./office.js?v=76699891b1bf";

const SIGNS_OUT = "signs_out";
const SHOWS = "shows_a_part";
const ACCEPTS = "accepts_a_request";
const DECLINES = "declines_a_request";
const CHOOSES_WEEKDAY = "chooses_a_weekday";
const SETS_FROM = "sets_hours_from";
const SETS_TO = "sets_hours_to";
const ADDS_HOURS = "adds_hours";
const REMOVES_HOURS = "removes_hours";
const SETS_BLOCK_FROM = "sets_block_from";
const SETS_BLOCK_TO = "sets_block_to";
const BLOCKS = "blocks_a_time";
const UNBLOCKS = "unblocks_a_time";

const PARTS = [["requests", "Requests"], ["week", "Weekly hours"], ["blocked", "Blocked times"]];
// weekday 0 is Sunday, as the platform counts; the week shown from Monday
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STATUS = { pending: "Waiting for you", accepted: "Accepted" };

/** Her diary: who is signed in, and what she has, kept fresh. */
class Diary extends Controller {
  constructor(chimes, office) {
    super(chimes);
    this.office = office;
    this.who = this.value("checking"); // checking, out, stranger or her
    this.userId = this.value("");
    this.zone = this.value("Europe/Madrid");
    this.part = this.value("requests");
    this.requests = this.value([]);
    this.week = this.value([]);
    this.blocked = this.value([]);
    this.weekday = this.value(1);
    this.from = this.value("09:00");
    this.to = this.value("17:00");
    this.blockFrom = this.value("");
    this.blockTo = this.value("");
    this.busy = this.value(false);
    this.problem = this.value("");
    this.start();
  }

  /** The last visit's sign-in, if it still holds. */
  async start() {
    if (!this.office) return;
    if (await this.office.restore()) await this.check();
    else this.who.setValue("out");
  }

  async signedInWithGoogle(credential, nonce) {
    this.problem.setValue("");
    const signed = await this.office.signInWithGoogle(credential, nonce);
    if (!signed.ok) { this.problem.setValue(signed.error); return; }
    await this.check();
  }

  /** Hers or not; if hers, everything loaded and her requests heard live. */
  async check() {
    this.userId.setValue(this.office.userId());
    const hers = await this.office.isHers();
    if (!hers.ok) { this.who.setValue("out"); this.problem.setValue(hers.error); return; }
    if (!hers.data) { this.who.setValue("stranger"); return; }
    const settings = await this.office.settings();
    if (settings.data?.time_zone) this.zone.setValue(settings.data.time_zone);
    this.who.setValue("her");
    await Promise.all([this.loadRequests(), this.loadWeek(), this.loadBlocked()]);
    this.office.listen(() => this.loadRequests());
  }

  async loadRequests() { this.kept(await this.office.requests(), this.requests); }

  async loadWeek() {
    const found = await this.office.week();
    if (found.ok) found.data.sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.starts.localeCompare(b.starts));
    this.kept(found, this.week);
  }

  async loadBlocked() { this.kept(await this.office.blocked(), this.blocked); }

  kept(found, into) {
    if (found.ok) into.setValue(found.data);
    else this.problem.setValue(found.error);
  }

  /** A change sent, then what it changed loaded again; while it goes, nothing else is sent. */
  async change(work, then) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    this.busy.setValue(false);
    if (!done.ok) this.problem.setValue(done.error);
    await then();
    return done.ok;
  }

  answers() { return [SIGNS_OUT, SHOWS, ACCEPTS, DECLINES, CHOOSES_WEEKDAY, SETS_FROM, SETS_TO, ADDS_HOURS, REMOVES_HOURS, SETS_BLOCK_FROM, SETS_BLOCK_TO, BLOCKS, UNBLOCKS]; }

  would(action) {
    const changes = [ACCEPTS, DECLINES, ADDS_HOURS, REMOVES_HOURS, BLOCKS, UNBLOCKS];
    if (changes.includes(action) && this.busy.read()) return Phrase.of("Saving");
    if (action === ADDS_HOURS && !(this.from.read() && this.to.read() && this.from.read() < this.to.read())) return Phrase.of("The hours must end after they start");
    if (action === BLOCKS && !(this.blockFrom.read() && this.blockTo.read())) return Phrase.of("Choose when it starts and ends");
    if (action === BLOCKS && this.blockFrom.read() >= this.blockTo.read()) return Phrase.of("It must end after it starts");
    return null;
  }

  told(action, payload) {
    if (action === SHOWS) this.part.setValue(payload.part);
    if (action === CHOOSES_WEEKDAY) this.weekday.setValue(payload.weekday);
    if (action === SETS_FROM) this.from.setValue(payload.line);
    if (action === SETS_TO) this.to.setValue(payload.line);
    if (action === SETS_BLOCK_FROM) this.blockFrom.setValue(payload.line);
    if (action === SETS_BLOCK_TO) this.blockTo.setValue(payload.line);
    if (action === ACCEPTS) this.change(() => this.office.answerRequest(payload.id, "accepted"), () => this.loadRequests());
    if (action === DECLINES) this.change(() => this.office.answerRequest(payload.id, "declined"), () => this.loadRequests());
    if (action === ADDS_HOURS) this.change(() => this.office.addHours(this.weekday.read(), this.from.read(), this.to.read()), () => this.loadWeek());
    if (action === REMOVES_HOURS) this.change(() => this.office.removeHours(payload.id), () => this.loadWeek());
    if (action === BLOCKS) {
      this.change(() => this.office.block(this.blockFrom.read(), this.blockTo.read()), () => this.loadBlocked())
        .then((done) => { if (done) { this.blockFrom.setValue(""); this.blockTo.setValue(""); } });
    }
    if (action === UNBLOCKS) this.change(() => this.office.unblock(payload.id), () => this.loadBlocked());
    if (action === SIGNS_OUT) {
      this.office.signOut().then(() => {
        for (const value of [this.requests, this.week, this.blocked]) value.setValue([]);
        this.userId.setValue("");
        this.problem.setValue("");
        this.who.setValue("out");
      });
    }
    return null;
  }

  /** A moment, as it reads on her clock. */
  said(at, options) { return new Intl.DateTimeFormat("en-GB", { timeZone: this.zone.read(), ...options }).format(new Date(at)); }

  when(at) { return this.said(at, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }

  until(starts, ends) {
    const sameDay = this.said(starts, { dateStyle: "short" }) === this.said(ends, { dateStyle: "short" });
    return `${this.when(starts)} – ${sameDay ? this.said(ends, { hour: "2-digit", minute: "2-digit" }) : this.when(ends)}`;
  }
}

export class ShivonnesDiary extends ChimeApp {
  look() {
    const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
    return Look.make(dark ? DARK : LIGHT);
  }

  declare(register) {
    register.declareAll({
      [SIGNS_OUT]: ["Sign out"],
      [SHOWS]: ["Show"],
      [ACCEPTS]: ["Accept"],
      [DECLINES]: ["Decline"],
      [CHOOSES_WEEKDAY]: ["Choose a day"],
      [SETS_FROM]: ["From"],
      [SETS_TO]: ["To"],
      [ADDS_HOURS]: ["Add these hours"],
      [REMOVES_HOURS]: ["Remove"],
      [SETS_BLOCK_FROM]: ["From"],
      [SETS_BLOCK_TO]: ["To"],
      [BLOCKS]: ["Block this time"],
      [UNBLOCKS]: ["Remove"],
    });
  }

  describe() {
    const ui = this.ui;
    // walked by its probe (?probe), the diary is handed a stand-in office and reaches nothing
    const probing = new URLSearchParams(location.search).has("probe");
    this.diary = this.model(new Diary(this.chimes, probing ? null : new Office()));
    const diary = this.diary;
    const is = (who) => diary.who.map((now) => now === who);

    const header = ui.column([
      ui.row([
        ui.column([ui.text("Shivonne Dubarry", "Masthead MastheadWords"), ui.text(Phrase.of("Diary"), "Disciplines")], "Brand").grow(),
        ui.when(ui.bound(() => diary.who.read() === "her" || diary.who.read() === "stranger"), ui.button(SIGNS_OUT, { style: "SecondaryButton" })),
      ], "MastRow"),
      ui.divider("Rule"),
    ], "Header");

    const problem = ui.when(diary.problem.map((words) => words !== ""), ui.text(diary.problem, "Problem").wraps());

    return ui.app("shivonnes_diary", [
      header,
      problem,
      ui.when(is("checking"), ui.text(Phrase.of("Opening…"), "SmallPrint")),
      ui.when(is("out"), this.signIn()),
      ui.when(is("stranger"), this.stranger()),
      ui.when(is("her"), this.hers()),
    ]);
  }

  probe() { return import("./probe.js?v=76699891b1bf").then((made) => new made.Probe(this)); }

  /** The app mounted: Google's button drawn whenever the sign-in shows. */
  mount(element) {
    super.mount(element);
    this.chimes.follow({ region: Chimes.GLOBAL }, "google", () => {
      if (this.diary.who.read() !== "out") return;
      // once the sign-in stands: it is drawn a turn or two after the diary says so
      const draw = (tries) => {
        const place = document.getElementById("google-button");
        if (!place) { if (tries) setTimeout(() => draw(tries - 1), 20); return; }
        if (place.childElementCount || !this.diary.office) return;
        this.diary.office.drawGoogleButton(place, (credential, nonce) => this.diary.signedInWithGoogle(credential, nonce))
          .catch((trouble) => this.diary.problem.setValue(trouble.message));
      };
      setTimeout(() => draw(50), 0);
    });
    return this;
  }

  signIn() {
    const ui = this.ui;
    return ui.column([
      ui.text(Phrase.of("Your diary"), "PageTitle"),
      ui.text(Phrase.of("Sign in with your Google account to see requests and set your hours."), "Body").wraps(),
      ui.surface("GoogleButton").named("google-button"),
    ], "SignIn");
  }

  stranger() {
    const ui = this.ui;
    return ui.column([
      ui.text(Phrase.of("This account isn't set up for the diary"), "PageTitle").wraps(),
      ui.text(Phrase.of("If this is your account, Shivonne, send this number to Ian so he can set it up:"), "Body").wraps(),
      ui.text(this.diary.userId, "AccountId"),
    ], "Stranger");
  }

  hers() {
    const ui = this.ui;
    const diary = this.diary;
    const parts = ui.row(PARTS.map(([part, words]) => ui.pressable(SHOWS, { part }, [ui.text(Phrase.of(words))], "Choice PartChoice")
      .currentWhile(diary.part.map((now) => now === part))), "Parts");
    const showing = (part) => diary.part.map((now) => now === part);
    return ui.column([
      parts,
      ui.text(ui.bound(() => Phrase.with("Times are on your clock (%s).", [diary.zone.read()])), "SmallPrint"),
      ui.when(showing("requests"), this.requestsPart()),
      ui.when(showing("week"), this.weekPart()),
      ui.when(showing("blocked"), this.blockedPart()),
    ], "Hers");
  }

  requestsPart() {
    const ui = this.ui;
    const diary = this.diary;
    const session = (id) => SESSIONS.find((made) => made.id === id)?.name ?? id;
    const card = (request) => ui.surface("Request", [
      ui.row([
        ui.text(request.map((made) => (made ? diary.when(made.starts) : "")), "RequestWhen").grow(),
        ui.text(request.map((made) => STATUS[made?.status] ?? ""), "Status"),
      ], "RequestHead"),
      ui.text(request.map((made) => (made ? session(made.session) : "")), "RequestSession"),
      ui.text(request.map((made) => made?.name ?? ""), "RequestName"),
      ui.hyperlink(request.map((made) => `mailto:${made?.email ?? ""}`), [ui.text(request.map((made) => made?.email ?? ""))], "RequestEmail", { stays: true }),
      ui.when(request.map((made) => !!made?.phone), ui.text(request.map((made) => made?.phone ?? ""), "RequestPhone")),
      ui.row([
        ui.when(request.map((made) => made?.status === "pending"), ui.pressable(ACCEPTS, request.map((made) => ({ id: made?.id })), [ui.text(ui.words(ACCEPTS))], "PrimaryButton")),
        ui.pressable(DECLINES, request.map((made) => ({ id: made?.id })), [ui.text(request.map((made) => (made?.status === "accepted" ? "Cancel it" : "Decline")))], "SecondaryButton"),
      ], "RequestActions"),
    ]);
    return ui.column([
      ui.when(diary.requests.map((all) => !all.length), ui.text(Phrase.of("No requests waiting. New ones appear here as they come."), "Body").wraps()),
      ui.each(diary.requests, card, (made) => made.id, "Requests"),
    ], "Part");
  }

  weekPart() {
    const ui = this.ui;
    const diary = this.diary;
    const short = (time) => String(time ?? "").slice(0, 5);
    const row = (hours) => ui.row([
      ui.text(hours.map((made) => (made ? WEEKDAYS[made.weekday] : "")), "HoursDay"),
      ui.text(hours.map((made) => (made ? `${short(made.starts)} – ${short(made.ends)}` : "")), "HoursTime").grow(),
      ui.pressable(REMOVES_HOURS, hours.map((made) => ({ id: made?.id })), [ui.text(ui.words(REMOVES_HOURS))], "SecondaryButton Small"),
    ], "HoursRow");
    return ui.column([
      ui.text(Phrase.of("Visitors can book any hour inside these, unless it's blocked or already requested."), "Body").wraps(),
      ui.when(diary.week.map((all) => !all.length), ui.text(Phrase.of("No hours set, so nothing can be booked."), "Body")),
      ui.each(diary.week, row, (made) => made.id, "HoursList"),
      ui.surface("AddForm", [
        ui.text(Phrase.of("Add hours"), "Subhead"),
        ui.row(WEEK_ORDER.map((weekday) => ui.pressable(CHOOSES_WEEKDAY, { weekday }, [ui.text(WEEKDAYS[weekday].slice(0, 3))], "Choice WeekdayChoice")
          .currentWhile(diary.weekday.map((now) => now === weekday))), "Weekdays"),
        ui.row([
          ui.field(SETS_FROM, "", { label: Phrase.of("From"), changes: SETS_FROM, shows: diary.from, kind: "time" }),
          ui.field(SETS_TO, "", { label: Phrase.of("To"), changes: SETS_TO, shows: diary.to, kind: "time" }),
        ], "TimeFields"),
        ui.button(ADDS_HOURS, { style: "PrimaryButton" }),
      ]),
    ], "Part");
  }

  blockedPart() {
    const ui = this.ui;
    const diary = this.diary;
    const row = (time) => ui.row([
      ui.text(time.map((made) => (made ? diary.until(made.starts, made.ends) : "")), "BlockedTime").grow(),
      ui.pressable(UNBLOCKS, time.map((made) => ({ id: made?.id })), [ui.text(ui.words(UNBLOCKS))], "SecondaryButton Small"),
    ], "HoursRow");
    return ui.column([
      ui.text(Phrase.of("Nothing can be booked during these times, whatever your weekly hours say. Requests already made stay."), "Body").wraps(),
      ui.when(diary.blocked.map((all) => !all.length), ui.text(Phrase.of("Nothing blocked."), "Body")),
      ui.each(diary.blocked, row, (made) => made.id, "HoursList"),
      ui.surface("AddForm", [
        ui.text(Phrase.of("Block a time"), "Subhead"),
        ui.row([
          ui.field(SETS_BLOCK_FROM, "", { label: Phrase.of("From"), changes: SETS_BLOCK_FROM, shows: diary.blockFrom, kind: "datetime-local" }),
          ui.field(SETS_BLOCK_TO, "", { label: Phrase.of("To"), changes: SETS_BLOCK_TO, shows: diary.blockTo, kind: "datetime-local" }),
        ], "TimeFields"),
        ui.button(BLOCKS, { style: "PrimaryButton" }),
      ]),
    ], "Part");
  }
}

ChimeApp.start(ShivonnesDiary, document.getElementById("app"));
