// Shivonne's diary: her private page. She signs in with Google; then she
// sees the requests visitors make, as they come, and accepts or declines
// each; sets the hours she works, week by week; and blocks out times. Every
// time is shown and typed on her clock (her time zone, in backend.sql's
// settings). In Website she changes the site's words and pictures, saved
// on the platform for the site to read as it opens (content.js); nothing
// shows on the site until she saves. Anyone else who signs in is told the account isn't set up, and
// shown its id: the id that, put in shivonne_dubarry_staff, makes an account
// hers - as her verified email address does, put in
// shivonne_dubarry_staff_emails, even before she first signs in.

import { ChimeApp, Chimes, Controller, Look, Phrase } from "../gd_chime/gd_chime.js?v=3f7f76f11b9f";
import { LIMITS, SESSIONS, SESSION_IDS, merged, useContent } from "../content.js?v=3f7f76f11b9f";
import { DARK, LIGHT } from "../palette.js?v=3f7f76f11b9f";
import { Office } from "./office.js?v=3f7f76f11b9f";

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
const EDITS_PAGE = "edits_the_website";
const ADDS_ITEM = "adds_an_item";
const REMOVES_ITEM = "removes_an_item";
const CHOOSES_PICTURE = "chooses_a_picture";
const REMOVES_PICTURE = "removes_a_picture";
const SAVES_PAGE = "saves_the_website";
const DISCARDS_PAGE = "discards_website_changes";

const PARTS = [["requests", "Requests"], ["week", "Weekly hours"], ["blocked", "Blocked times"], ["site", "Website"]];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// what a new item of a list starts as
const BLANK = { areas: { name: "", text: "" }, questions: { question: "", answer: "" } };
let made = 0;
const withIds = (page) => ({ ...page, ...Object.fromEntries(["areas", "questions", "steps"].map((list) => [list, page[list].map((item) => ({ ...item, _id: ++made }))])) });
const withoutIds = (page) => ({ ...page, ...Object.fromEntries(["areas", "questions", "steps"].map((list) => [list, page[list].map(({ _id, ...item }) => item)])) });
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
    this.page = this.value(null);      // the website as she is editing it
    this.savedPage = this.value("");   // the website as last saved, to tell what changed
    this.pageNote = this.value("");    // what the last save or picture came to
    this.uploading = this.value("");   // which picture is uploading
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
    await this.loadPage();
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

  /** The website as last saved, to edit; its session names used for her requests too. */
  async loadPage() {
    const found = await this.office.page();
    if (!found.ok) { this.problem.setValue(found.error); return; }
    useContent(found.data);
    const page = merged(found.data);
    this.savedPage.setValue(JSON.stringify(page));
    this.page.setValue(withIds(page));
  }

  /** Whether the website has changes she hasn't saved. */
  changed() {
    const page = this.page.read();
    return !!page && JSON.stringify(withoutIds(page)) !== this.savedPage.read();
  }

  editPage(payload) {
    this.pageNote.setValue("");
    this.page.update((page) => {
      if (payload.list) return { ...page, [payload.list]: page[payload.list].map((item) => (item._id === payload.id ? { ...item, [payload.key]: payload.line } : item)) };
      if (payload.session) {
        const value = payload.key === "minutes" ? Number(payload.line) : payload.line;
        return { ...page, sessions: { ...page.sessions, [payload.session]: { ...page.sessions[payload.session], [payload.key]: value } } };
      }
      return { ...page, [payload.key]: payload.line };
    });
  }

  async choosePicture(which, file) {
    this.uploading.setValue(which);
    this.problem.setValue("");
    this.pageNote.setValue("");
    const kept = await this.office.uploadPicture(which, file);
    this.uploading.setValue("");
    if (!kept.ok) { this.problem.setValue(kept.error); return; }
    this.page.update((page) => ({ ...page, [`${which}_picture`]: kept.data }));
    this.pageNote.setValue("The picture is ready. Press Save to put it on your website.");
  }

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

  answers() {
    return [SIGNS_OUT, SHOWS, ACCEPTS, DECLINES, CHOOSES_WEEKDAY, SETS_FROM, SETS_TO, ADDS_HOURS, REMOVES_HOURS, SETS_BLOCK_FROM, SETS_BLOCK_TO, BLOCKS, UNBLOCKS,
      EDITS_PAGE, ADDS_ITEM, REMOVES_ITEM, CHOOSES_PICTURE, REMOVES_PICTURE, SAVES_PAGE, DISCARDS_PAGE];
  }

  would(action, payload) {
    const changes = [ACCEPTS, DECLINES, ADDS_HOURS, REMOVES_HOURS, BLOCKS, UNBLOCKS, SAVES_PAGE, DISCARDS_PAGE];
    if (changes.includes(action) && this.busy.read()) return Phrase.of("Saving");
    if (action === CHOOSES_PICTURE && this.uploading.read()) return Phrase.of("A picture is uploading");
    if (action === ADDS_ITEM && (this.page.read()?.[payload.list]?.length ?? 0) >= LIMITS.list) return Phrase.of("That's as many as fit");
    if (action === DISCARDS_PAGE && !this.changed()) return Phrase.of("Nothing to undo");
    if (action === SAVES_PAGE) {
      const page = this.page.read();
      if (this.uploading.read()) return Phrase.of("Wait for the picture to finish uploading");
      if (!this.changed()) return Phrase.of("Nothing new to save");
      if (!page.name.trim()) return Phrase.of("Your name can't be empty");
      if (!EMAIL.test(page.email.trim())) return Phrase.of("Check the email address in the footer");
      const [shortest, longest] = LIMITS.minutes;
      if (SESSION_IDS.some((id) => !(Number.isInteger(page.sessions[id].minutes) && page.sessions[id].minutes >= shortest && page.sessions[id].minutes <= longest))) {
        return Phrase.with("A session's length is in minutes, from %d to %d", [shortest, longest]);
      }
    }
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
    if (action === EDITS_PAGE) this.editPage(payload);
    if (action === ADDS_ITEM) this.page.update((page) => ({ ...page, [payload.list]: [...page[payload.list], { ...BLANK[payload.list], _id: ++made }] }));
    if (action === REMOVES_ITEM) this.page.update((page) => ({ ...page, [payload.list]: page[payload.list].filter((item) => item._id !== payload.id) }));
    if (action === CHOOSES_PICTURE) {
      if (!payload.file.type.startsWith("image/")) return Phrase.of("Please choose a picture (JPEG, PNG or WebP)");
      this.choosePicture(payload.which, payload.file);
    }
    if (action === REMOVES_PICTURE) this.page.update((page) => ({ ...page, [`${payload.which}_picture`]: "" }));
    if (action === DISCARDS_PAGE) { this.page.setValue(withIds(JSON.parse(this.savedPage.read()))); this.pageNote.setValue(""); }
    if (action === SAVES_PAGE) {
      const page = withoutIds(this.page.read());
      const tidy = { ...page, name: page.name.trim(), email: page.email.trim() };
      this.change(() => this.office.savePage(tidy), () => this.loadPage())
        .then((done) => { if (done) this.pageNote.setValue("Saved. Your website shows it to everyone who opens it from now on."); });
    }
    if (action === SIGNS_OUT) {
      this.office.signOut().then(() => {
        for (const value of [this.requests, this.week, this.blocked]) value.setValue([]);
        this.page.setValue(null);
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
      [EDITS_PAGE]: ["Change"],
      [ADDS_ITEM]: ["Add"],
      [REMOVES_ITEM]: ["Remove"],
      [CHOOSES_PICTURE]: ["Choose a picture"],
      [REMOVES_PICTURE]: ["Use the placeholder"],
      [SAVES_PAGE]: ["Save"],
      [DISCARDS_PAGE]: ["Undo changes"],
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

  probe() { return import("./probe.js?v=3f7f76f11b9f").then((made) => new made.Probe(this)); }

  /** The app mounted: Google's button drawn whenever the sign-in shows; leaving with the website unsaved asks first. */
  mount(element) {
    super.mount(element);
    addEventListener("beforeunload", (event) => { if (this.diary.changed()) { event.preventDefault(); event.returnValue = ""; } });
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
      ui.text(Phrase.of("If this is your account, Shivonne, ask Ian to add the email address you signed in with, or send him this number:"), "Body").wraps(),
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
      ui.when(diary.part.map((now) => now !== "site"), ui.text(ui.bound(() => Phrase.with("Times are on your clock (%s).", [diary.zone.read()])), "SmallPrint")),
      ui.when(showing("requests"), this.requestsPart()),
      ui.when(showing("week"), this.weekPart()),
      ui.when(showing("blocked"), this.blockedPart()),
      ui.when(showing("site"), this.sitePart()),
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

  // --- the website ---

  sitePart() {
    const ui = this.ui;
    const diary = this.diary;
    const text = (key, label, options) => this.editText(diary.page.map((page) => page?.[key] ?? ""), (line) => ({ key, line }), label, options);
    const session = (id, key, label, options) => this.editText(diary.page.map((page) => page?.sessions[id][key] ?? ""), (line) => ({ session: id, key, line }), label, options);
    const section = (title, content) => ui.surface("EditSection", [ui.text(title, "Subhead"), ...content]);
    const state = ui.bound(() => {
      if (diary.uploading.read()) return Phrase.of("Uploading the picture…");
      if (diary.problem.read()) return diary.problem.read();
      if (diary.pageNote.read()) return diary.pageNote.read();
      if (diary.changed()) return Phrase.of("You have changes that aren't on your website yet.");
      return Phrase.of("Your website shows everything here.");
    });
    const editor = ui.column([
      ui.text(Phrase.of("Change the words and pictures on your website. Nothing changes on the website until you press Save."), "Body").wraps(),
      ui.hyperlink("../", [ui.text(Phrase.of("Open your website ↗"))], "SecondaryButton OpenSite"),
      section(Phrase.of("Top of the page"), [
        text("name", Phrase.of("Your name")),
        text("disciplines", Phrase.of("Under your name"), { hint: Phrase.of("Separate them with · or a comma.") }),
        text("headline", Phrase.of("Headline"), { long: true }),
        text("intro", Phrase.of("Introduction"), { long: true }),
        this.pictureEdit("hero", Phrase.of("Picture beside the headline")),
      ]),
      section(Phrase.of("Who I work with"), [
        text("areas_kicker", Phrase.of("Section name")),
        text("areas_title", Phrase.of("Section heading"), { long: true }),
        this.listEdit("areas", [["name", Phrase.of("Name"), false], ["text", Phrase.of("Words"), true]], Phrase.of("Add an area"), Phrase.of("Remove this area")),
      ]),
      section(Phrase.of("About"), [
        text("about_kicker", Phrase.of("Section name (also in the menu)")),
        this.pictureEdit("portrait", Phrase.of("Your portrait")),
        text("about", Phrase.of("About you"), { long: true, tall: true, hint: Phrase.of("Leave an empty line between paragraphs.") }),
        text("training_title", Phrase.of("Heading")),
        text("training", Phrase.of("Training and registration"), { long: true }),
      ]),
      section(Phrase.of("How I work"), [
        text("how_kicker", Phrase.of("Section name (also in the menu)")),
        text("how_title", Phrase.of("Section heading"), { long: true }),
        this.listEdit("steps", [["name", Phrase.of("Step"), false], ["text", Phrase.of("Words"), true]]),
      ]),
      section(Phrase.of("Fees"), [
        text("fees_kicker", Phrase.of("Section name (also in the menu)")),
        text("fees_title", Phrase.of("Section heading")),
        ...SESSION_IDS.map((id) => ui.surface("EditItem", [
          session(id, "name", Phrase.of("Session")),
          ui.row([session(id, "minutes", Phrase.of("Minutes"), { kind: "number" }), session(id, "fee", Phrase.of("Fee"))], "EditPair"),
          session(id, "text", Phrase.of("Words"), { long: true }),
        ])),
        text("fees_note", Phrase.of("Small print under the fees"), { long: true }),
      ]),
      section(Phrase.of("Questions"), [
        text("questions_kicker", Phrase.of("Section name")),
        text("questions_title", Phrase.of("Section heading")),
        this.listEdit("questions", [["question", Phrase.of("Question"), false], ["answer", Phrase.of("Answer"), true]], Phrase.of("Add a question"), Phrase.of("Remove this question")),
      ]),
      section(Phrase.of("Invitation to book"), [
        text("invitation_title", Phrase.of("Heading")),
        text("invitation_text", Phrase.of("Words"), { long: true }),
      ]),
      section(Phrase.of("Footer"), [
        text("credentials", Phrase.of("Under your name"), { long: true }),
        text("email", Phrase.of("Contact email"), { kind: "email" }),
        text("location", Phrase.of("Where you are"), { long: true }),
        text("registration", Phrase.of("Registration"), { long: true }),
        text("crisis", Phrase.of("Not an emergency service"), { long: true }),
        text("land", Phrase.of("Land acknowledgement"), { long: true, hint: Phrase.of("Leave it empty to show none.") }),
      ]),
      ui.surface("SaveBar", [
        ui.text(state, "SaveState").wraps(),
        ui.row([
          ui.pressable(DISCARDS_PAGE, {}, [ui.text(ui.words(DISCARDS_PAGE))], "SecondaryButton").absentWhenRefused(),
          ui.button(SAVES_PAGE, { style: "PrimaryButton" }),
        ], "SaveActions"),
      ]),
    ], "Part SiteEditor");
    return ui.when(diary.page.map((page) => page !== null), editor, ui.text(Phrase.of("Opening your website…"), "SmallPrint"));
  }

  /** Words to edit: a line, or a box of lines given long. */
  editText(shows, carries, label, { long = false, tall = false, hint = null, kind = "text" } = {}) {
    const ui = this.ui;
    const box = long
      ? [ui.text(label, "EditLabel"), ui.area(EDITS_PAGE, shows, tall ? "EditArea Tall" : "EditArea", { carries })]
      : [ui.field(EDITS_PAGE, "EditField", { label, changes: EDITS_PAGE, shows, carries, kind })];
    return ui.column([...box, hint ? ui.text(hint, "Hint").wraps() : null].filter(Boolean), "Edit");
  }

  /** A list's items, each with its words; added to and taken from when it says how. */
  listEdit(list, fields, adds = null, removes = null) {
    const ui = this.ui;
    const diary = this.diary;
    const item = (handle) => ui.surface("EditItem", [
      ...fields.map(([key, label, long]) => this.editText(handle.map((held) => held?.[key] ?? ""), (line) => ({ list, id: handle.read()?._id, key, line }), label, { long })),
      removes ? ui.pressable(REMOVES_ITEM, handle.map((held) => ({ list, id: held?._id })), [ui.text(removes)], "SecondaryButton Small RemoveItem") : null,
    ].filter(Boolean));
    return ui.column([
      ui.each(diary.page.map((page) => page?.[list] ?? []), item, (held) => held._id, "EditList"),
      adds ? ui.pressable(ADDS_ITEM, { list }, [ui.text(adds)], "SecondaryButton AddItem") : null,
    ].filter(Boolean), "EditListHolder");
  }

  /** A picture of the site's: as it is now, another chosen, or the placeholder put back; and its words for people who can't see it. */
  pictureEdit(which, label) {
    const ui = this.ui;
    const diary = this.diary;
    const path = diary.page.map((page) => page?.[`${which}_picture`] ?? "");
    const shown = ui.bound(() => (path.read() && diary.office ? diary.office.pictureAddress(path.read()) : `../images/${which}.svg`));
    const choosing = ui.bound(() => (diary.uploading.read() === which ? Phrase.of("Uploading…") : path.read() ? Phrase.of("Choose another picture") : Phrase.of("Choose a picture")));
    return ui.surface("EditPicture", [
      ui.text(label, "EditLabel"),
      ui.image(shown, `EditPreview ${which}`, label),
      ui.row([
        ui.file(CHOOSES_PICTURE, choosing, { accept: "image/*", payload: { which }, style: "SecondaryButton" }),
        ui.when(path.map((now) => !!now), ui.pressable(REMOVES_PICTURE, { which }, [ui.text(ui.words(REMOVES_PICTURE))], "SecondaryButton")),
      ], "PictureActions"),
      this.editText(diary.page.map((page) => page?.[`${which}_alt`] ?? ""), (line) => ({ key: `${which}_alt`, line }), Phrase.of("Describe the picture, for people who can't see it")),
    ]);
  }
}

ChimeApp.start(ShivonnesDiary, document.getElementById("app"));
