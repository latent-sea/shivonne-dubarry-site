// Shivonne Dubarry: a counsellor's home page with a booking widget, on
// gd-chime for the web. What it says and shows she edits in her diary; it is
// read from the platform as the page opens, over the defaults in content.js.
// This file is how it is laid out.
//
// Two screens. The home page scrolls through who she works with, About,
// How I work, Fees and Questions; the header's links are addresses on it
// (#about, #how, #fees), so they work from the booking screen too. Booking
// (#book) goes in four steps - a session, a day and a time, the visitor's
// details, a check - then sends the request to her (desk.js). The times are
// her free ones, from the platform, shown in the visitor's own time zone. A
// request holds its time until she answers. Sessions are online.

import { ChimeApp, Chimes, Controller, Driver, Look, Phrase } from "./gd_chime/gd_chime.js?v=3f7f76f11b9f";
import { ABOUT, AREAS, FEES_NOTE, PAGE, QUESTIONS, SESSIONS, SITE, STEPS, useContent } from "./content.js?v=3f7f76f11b9f";
import { Desk, pictureAddress } from "./desk.js?v=3f7f76f11b9f";
import { DARK, LIGHT } from "./palette.js?v=3f7f76f11b9f";

const HOME = "home";
const BOOK = "book";
const SECTIONS = ["areas", "about", "how", "fees", "questions"];

const GOES_HOME = "goes_home";
const BOOKS = "books_a_session";
const CHOOSES_SESSION = "chooses_a_session";
const CHOOSES_DAY = "chooses_a_day";
const CHOOSES_TIME = "chooses_a_time";
const SETS_NAME = "sets_the_name";
const SETS_EMAIL = "sets_the_email";
const SETS_PHONE = "sets_the_phone";
const CONTINUES = "continues";
const STEPS_BACK = "steps_back";
const REQUESTS = "requests_the_booking";
const RELOADS = "reloads_the_times";

const BOOKING_STEPS = ["Session", "Day and time", "Your details", "Confirm"];
// the days offered: four weeks from today, as the platform offers by default (backend.sql)
const DAYS = 28;


const said = (date, options) => new Intl.DateTimeFormat(undefined, options).format(date);
const dayWords = (date) => said(date, { weekday: "long", day: "numeric", month: "long" });
const timeWords = (date) => said(date, { hour: "numeric", minute: "2-digit" });
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dayId = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * A booking, step by step: what was chosen, who is asking, and how sending
 * it went. Her free times come from the desk; with none (the page walked by
 * its probe, which hands it a stand-in), it waits.
 */
class Booking extends Controller {
  constructor(chimes, desk, from = new Date()) {
    super(chimes);
    this.desk = desk;
    this.days = Array.from({ length: DAYS }, (_, ahead) => {
      const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + ahead);
      return { day: dayId(date), date };
    });
    this.openings = this.value([]);
    this.loading = this.value("waiting"); // waiting, loading, ready or failed
    this.step = this.value(1);
    this.session = this.value(null);
    this.day = this.value(null);
    this.time = this.value(null);
    this.name = this.value("");
    this.email = this.value("");
    this.phone = this.value("");
    this.sending = this.value(false);
    this.sent = this.value(false);
    this.problem = this.value("");  // why sending didn't work
    this.trouble = this.value("");  // why her times couldn't be found
    this.asked = 0;
    this.load();
  }

  /** Her free times, asked for again; only the latest answer counts. */
  load() {
    if (!this.desk) return;
    const asked = ++this.asked;
    this.loading.setValue("loading");
    this.desk.openings().then((found) => {
      if (asked !== this.asked || this.disposed) return;
      if (!found.ok) { this.loading.setValue("failed"); this.trouble.setValue(found.error); return; }
      this.openings.setValue(found.times.map((time) => ({ id: time.at.toISOString(), at: time.at, day: dayId(time.at) })));
      this.loading.setValue("ready");
      if (this.time.read() && !this.chosenTime()) this.time.setValue(null);
    });
  }

  timesOn(day) { return this.openings.read().filter((time) => time.day === day); }

  answers() { return [CHOOSES_SESSION, CHOOSES_DAY, CHOOSES_TIME, SETS_NAME, SETS_EMAIL, SETS_PHONE, CONTINUES, STEPS_BACK, REQUESTS, RELOADS]; }

  would(action, payload) {
    if (action === CHOOSES_DAY && !this.timesOn(payload.day).length) return Phrase.of("No times this day");
    if (action === STEPS_BACK && this.step.read() === 1) return Phrase.of("This is the first step");
    if (action === CONTINUES) {
      const step = this.step.read();
      if (step === 1 && !this.session.read()) return Phrase.of("Choose a session to continue");
      if (step === 2 && !this.time.read()) return Phrase.of("Choose a day and a time to continue");
      if (step === 3 && !this.name.read().trim()) return Phrase.of("Add your name to continue");
      if (step === 3 && !EMAIL.test(this.email.read().trim())) return Phrase.of("Add an email address to continue");
      if (step >= BOOKING_STEPS.length) return Phrase.of("This is the last step");
    }
    if (action === REQUESTS && this.sent.read()) return Phrase.of("Already requested");
    if (action === REQUESTS && this.sending.read()) return Phrase.of("Sending your request");
    if (action === STEPS_BACK && this.sending.read()) return Phrase.of("Sending your request");
    if (action === RELOADS && this.loading.read() === "loading") return Phrase.of("Finding her free times");
    return null;
  }

  told(action, payload) {
    if (action === CHOOSES_SESSION) this.session.setValue(payload.session);
    if (action === CHOOSES_DAY && this.day.read() !== payload.day) { this.day.setValue(payload.day); this.time.setValue(null); }
    if (action === CHOOSES_TIME) this.time.setValue(payload.time);
    if (action === SETS_NAME) this.name.setValue(payload.line);
    if (action === SETS_EMAIL) this.email.setValue(payload.line);
    if (action === SETS_PHONE) this.phone.setValue(payload.line);
    if (action === CONTINUES) { this.problem.setValue(""); this.step.update((step) => step + 1); }
    if (action === STEPS_BACK) { this.problem.setValue(""); this.step.update((step) => step - 1); }
    if (action === RELOADS) this.load();
    if (action === REQUESTS) this.send();
    return null;
  }

  send() {
    const time = this.chosenTime();
    this.sending.setValue(true);
    this.problem.setValue("");
    this.desk.request({ session: this.session.read(), at: time.at, name: this.name.read().trim(), email: this.email.read().trim(), phone: this.phone.read().trim() })
      .then((made) => {
        if (this.disposed) return;
        this.sending.setValue(false);
        if (made.ok) { this.sent.setValue(true); return; }
        this.problem.setValue(made.error);
        // the time went meanwhile: back to choosing one, from her times as they are now
        if (made.taken) { this.time.setValue(null); this.step.setValue(2); this.load(); }
      });
  }

  /** The chosen time, found among the openings. */
  chosenTime() {
    const id = this.time.read();
    return this.openings.read().find((time) => time.id === id) ?? null;
  }
}

export class ShivonneDubarry extends ChimeApp {
  look() {
    const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
    return Look.make(dark ? DARK : LIGHT);
  }

  declare(register) {
    register.declareAll({
      [GOES_HOME]: ["Home"],
      [BOOKS]: ["Book a session"],
      [CHOOSES_SESSION]: ["Choose a session"],
      [CHOOSES_DAY]: ["Choose a day"],
      [CHOOSES_TIME]: ["Choose a time"],
      [SETS_NAME]: ["Name"],
      [SETS_EMAIL]: ["Email"],
      [SETS_PHONE]: ["Phone"],
      [CONTINUES]: ["Continue"],
      [STEPS_BACK]: ["Back"],
      [REQUESTS]: ["Request this booking"],
      [RELOADS]: ["Try again"],
    });
  }

  describe() {
    const ui = this.ui;
    this.booking = this.model(new Booking(this.chimes, desk));

    const header = ui.column([
      ui.row([
        ui.column([
          ui.link(GOES_HOME, null, SITE.name, { style: "Masthead", words_style: "MastheadWords" }).goesTo(HOME),
          ui.text(SITE.disciplines.join(" · "), "Disciplines"),
        ], "Brand").grow(),
        ui.row([
          this.anchor("about", PAGE.about_kicker, "NavLink"),
          this.anchor("how", PAGE.how_kicker, "NavLink"),
          this.anchor("fees", PAGE.fees_kicker, "NavLink"),
          ui.button(BOOKS, { goes_to: BOOK, style: "PrimaryButton" }),
        ], "Nav"),
      ], "MastRow"),
      ui.divider("Rule"),
    ], "Header");

    const footer = ui.column([
      ui.row([
        ui.column([ui.text(SITE.name, "FooterName"), ui.text(SITE.credentials, "Footer").wraps()], "FooterColumn"),
        ui.column([
          ui.text(Phrase.of("Contact"), "FooterLabel"),
          ui.hyperlink(`mailto:${SITE.email}`, [ui.text(SITE.email)], "FooterLink", { stays: true }),
          ui.text(SITE.location, "Footer").wraps(),
        ], "FooterColumn"),
        ui.column([ui.text(Phrase.of("Registration"), "FooterLabel"), ui.text(SITE.registration, "Footer").wraps()], "FooterColumn"),
      ], "FooterGrid"),
      ui.column([ui.text(Phrase.of("Not an emergency service"), "FooterLabel"), ui.text(SITE.crisis, "Footer Crisis").wraps()], "CrisisNote"),
      ui.text(SITE.land, "Footer").wraps(),
      ui.text(Phrase.with("© %s %s", [new Date().getFullYear(), SITE.name]), "Footer"),
    ], "FooterBlock");

    return ui.app("shivonne_dubarry", [header, ui.stack([this.home(), this.book()]), footer]);
  }

  // loaded only when the page is walked (?probe), so an export leaves it out
  probe() { return import("./probe.js?v=3f7f76f11b9f").then((made) => new made.Probe(this)); }

  /** The app mounted, then its address kept: #book opens booking, a section's address scrolls to it. */
  mount(element) {
    super.mount(element);
    this.started.then((stood) => { if (stood) this.keepAddress(); });
    return this;
  }

  keepAddress() {
    const go = (place) => this.commands.dispatch(Chimes.GLOBAL, Driver.GO, { place });
    const open = () => {
      const wanted = location.hash.slice(1);
      if (wanted === BOOK) { if (!this.driver.isActive(BOOK)) go(BOOK); return; }
      if (this.driver.isActive(BOOK)) go(HOME);
      // the section once the home page stands again: two frames, past the driver's own scroll
      if (SECTIONS.includes(wanted)) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(wanted)?.scrollIntoView()));
    };
    open();
    addEventListener("hashchange", open);
    // the address follows the reader: #book while booking, so the phone's back button leaves it
    this.chimes.follow({ region: Chimes.GLOBAL }, "address", () => {
      const booking = this.driver.getTop().includes(BOOK);
      if (booking && location.hash !== `#${BOOK}`) history.pushState(null, "", `#${BOOK}`);
      else if (!booking && location.hash === `#${BOOK}`) history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
  }

  // --- pieces ---

  /** A link to a section of the home page, by its address. */
  anchor(section, words, style) {
    return this.ui.hyperlink(`#${section}`, [this.ui.text(words, style === "NavLink" ? "NavWords" : "")], style, { stays: true });
  }

  section(id, kicker, title, content, style = "") {
    const ui = this.ui;
    return ui.column([
      ui.column([ui.text(kicker, "Kicker"), title ? ui.text(title, "SectionTitle").wraps() : null].filter(Boolean), "SectionHead"),
      ...content,
    ], `Section ${style}`).named(id);
  }

  bookButton() { return this.ui.button(BOOKS, { goes_to: BOOK, style: "PrimaryButton" }); }

  /** Her picture for this place on the page, or the placeholder while she has none. */
  picture(which, style, placeholder) {
    const path = PAGE[`${which}_picture`];
    if (!path) return this.ui.image(placeholder, `${style} Placeholder`, which === "portrait" ? "Portrait placeholder" : "Image placeholder");
    return this.ui.image(pictureAddress(path), style, PAGE[`${which}_alt`]);
  }

  // --- the home page ---

  home() {
    const ui = this.ui;
    return ui.screen(HOME, [
      ui.surface("Hero", [
        ui.column([
          ui.text(SITE.headline, "Headline").wraps(),
          ui.text(SITE.intro, "Lead").wraps(),
          ui.row([this.bookButton(), this.anchor("how", PAGE.how_kicker, "SecondaryButton")], "Actions"),
        ], "HeroText"),
        this.picture("hero", "HeroImage", "images/hero.svg"),
      ]),

      this.section("areas", PAGE.areas_kicker, PAGE.areas_title, [
        ui.grid(AREAS.map((area) => ui.surface(`Area a-${area.id}`, [
          ui.text(area.name, "AreaName").wraps(),
          ui.text(area.text, "AreaText").wraps(),
        ])), [], "Areas"),
      ]),

      this.section("about", PAGE.about_kicker, null, [
        ui.surface("AboutGrid", [
          this.picture("portrait", "Portrait", "images/portrait.svg"),
          ui.column([
            ui.text(SITE.name, "SectionTitle").wraps(),
            ui.row(SITE.disciplines.map((discipline) => ui.text(discipline, "Discipline")), "Disciplines Row"),
            ...ABOUT.paragraphs.map((words) => ui.text(words, "Body").wraps()),
            ui.text(PAGE.training_title, "Subhead"),
            ui.text(ABOUT.training, "Body").wraps(),
          ], "AboutText"),
        ]),
      ]),

      this.section("how", PAGE.how_kicker, PAGE.how_title, [
        ui.row(STEPS.map((step, index) => ui.column([
          ui.text(String(index + 1), "StepNumber"),
          ui.text(step.name, "StepName"),
          ui.text(step.text, "StepText").wraps(),
        ], "Step")), "Steps"),
      ]),

      this.section("fees", PAGE.fees_kicker, PAGE.fees_title, [
        ui.column(SESSIONS.map((session) => ui.row([
          ui.column([ui.text(session.name, "FeeName"), ui.text(session.text, "FeeText").wraps()], "FeeWords").grow(),
          ui.text(Phrase.with("%d min", [session.minutes]), "FeeLength"),
          ui.text(session.fee, "FeeAmount"),
        ], "Fee")), "Fees"),
        ui.text(FEES_NOTE, "SmallPrint").wraps(),
      ]),

      this.section("questions", PAGE.questions_kicker, PAGE.questions_title, [
        ui.column(QUESTIONS.map(([question, answer]) => this.question(question, answer)), "Questions"),
      ]),

      ui.surface("Invitation", [
        ui.column([
          ui.text(PAGE.invitation_title, "InvitationTitle").wraps(),
          ui.text(PAGE.invitation_text, "Lead").wraps(),
        ], "InvitationText"),
        this.bookButton(),
      ]),
    ]);
  }

  /** A question that opens to its answer, and closes again. */
  question(question, answer) {
    const ui = this.ui;
    const open = ui.local(false);
    return ui.column([
      ui.pressLocal(open, (held) => !held, [
        ui.text(question, "QuestionWords").wraps(),
        ui.text(open.map((held) => (held ? "−" : "+")), "QuestionMark"),
      ], "Question"),
      ui.when(open, ui.text(answer, "Answer").wraps()),
    ], "QuestionItem");
  }

  // --- booking ---

  book() {
    const ui = this.ui;
    const booking = this.booking;
    const at = (step) => booking.step.map((now) => now === step);
    const stepper = ui.row(BOOKING_STEPS.map((name, index) => {
      const words = Phrase.with("%d. %s", [index + 1, name]);
      return ui.when(at(index + 1), ui.text(words, "StepMark Now"),
        ui.when(booking.step.map((now) => now > index + 1), ui.text(words, "StepMark Done"), ui.text(words, "StepMark Ahead")));
    }), "Stepper");

    const choices = ui.column(SESSIONS.map((session) => ui.pressable(CHOOSES_SESSION, { session: session.id }, [
      ui.text(session.name, "ChoiceName"),
      ui.text(Phrase.with("%d min · %s", [session.minutes, session.fee]), "ChoiceDetail"),
      ui.text(session.text, "ChoiceDetail").wraps(),
    ], "Choice SessionChoice").currentWhile(booking.session.map((chosen) => chosen === session.id))), "Choices");

    const days = ui.grid(booking.days.map((day) => ui.pressable(CHOOSES_DAY, { day: day.day }, [
      ui.text(said(day.date, { weekday: "short" }), "DayName"),
      ui.text(said(day.date, { day: "numeric" }), "DayNumber"),
      ui.text(said(day.date, { month: "short" }), "DayMonth"),
    ], "Choice DayChoice").currentWhile(booking.day.map((chosen) => chosen === day.day))), [1, 1, 1, 1, 1, 1, 1], "Days");

    const times = booking.days.map((day) => ui.when(booking.day.map((chosen) => chosen === day.day), ui.column([
      ui.text(Phrase.with("Times on %s", [dayWords(day.date)]), "Subhead"),
      ui.eachAcross(ui.bound(() => booking.timesOn(day.day)), (time) => ui.pressable(CHOOSES_TIME, time.map((at) => ({ time: at?.id })), [ui.text(time.map((at) => (at ? timeWords(at.at) : "")))], "Choice TimeChoice")
        .currentWhile(ui.bound(() => booking.time.read() === time.read()?.id)), (time) => time.id, "Times"),
    ], "DayTimes")));

    // her times as they arrive: finding them, couldn't, none at all, or the days to choose from
    const loading = (state) => booking.loading.map((now) => now === state);
    const when = ui.column([
      ui.when(loading("loading"), ui.text(Phrase.of("Finding her free times…"), "SmallPrint")),
      ui.when(loading("failed"), ui.column([
        ui.text(booking.trouble, "Problem").wraps(),
        ui.button(RELOADS, { style: "SecondaryButton" }),
      ], "Trouble")),
      ui.when(ui.bound(() => booking.loading.read() === "ready" && !booking.openings.read().length),
        ui.text(Phrase.with("There are no free times in the next four weeks. Please email %s.", [SITE.email]), "Body").wraps()),
      ui.when(ui.bound(() => booking.loading.read() === "ready" && booking.openings.read().length > 0), ui.column([days, ...times], "DaysAndTimes")),
    ], "When");

    const details = ui.column([
      ui.field(SETS_NAME, "", { label: Phrase.of("Your name"), changes: SETS_NAME, shows: booking.name, autocomplete: "name" }),
      ui.field(SETS_EMAIL, "", { label: Phrase.of("Email address"), changes: SETS_EMAIL, shows: booking.email, kind: "email", autocomplete: "email" }),
      ui.field(SETS_PHONE, "", { label: Phrase.of("Phone (optional)"), changes: SETS_PHONE, shows: booking.phone, kind: "tel", autocomplete: "tel" }),
      ui.text(Phrase.of("Please don't include anything about your health here. There will be time to talk about what brings you in."), "SmallPrint").wraps(),
    ], "Details");

    const summary = (style) => ui.column([
      this.summaryRow(Phrase.of("Session"), ui.bound(() => SESSIONS.find((session) => session.id === booking.session.read())?.name ?? Phrase.of("Not chosen yet"))),
      this.summaryRow(Phrase.of("When"), ui.bound(() => {
        const time = booking.chosenTime();
        return time ? `${dayWords(time.at)}, ${timeWords(time.at)}` : Phrase.of("Not chosen yet");
      })),
      this.summaryRow(Phrase.of("How"), Phrase.of("Online")),
      style === "Check" ? this.summaryRow(Phrase.of("Name"), booking.name) : null,
      style === "Check" ? this.summaryRow(Phrase.of("Email"), booking.email) : null,
      style === "Check" ? ui.when(booking.phone.map((phone) => phone.trim() !== ""), this.summaryRow(Phrase.of("Phone"), booking.phone)) : null,
    ].filter(Boolean), `Summary ${style}`);

    const check = ui.column([
      summary("Check"),
      ui.when(booking.sent, ui.surface("Notice", [
        ui.text(Phrase.of("Your request is sent"), "NoticeTitle"),
        ui.text(ui.bound(() => Phrase.with("The time is held for you while Shivonne looks at your request. She will reply to %s.", [booking.email.read().trim()])), "NoticeWords").wraps(),
        ui.button(GOES_HOME, { goes_to: HOME, style: "SecondaryButton" }),
      ])),
    ], "CheckStep");

    return ui.screen(BOOK, [
      ui.column([
        ui.column([
          ui.text(Phrase.of("Booking"), "Kicker"),
          ui.text(Phrase.of("Book a session"), "PageTitle").wraps(),
          ui.text(Phrase.with("Sessions are online. Times are shown in your time zone (%s).", [zone()]), "SmallPrint").wraps(),
        ], "BookingHead"),
        stepper,
        ui.surface("BookingGrid", [
          ui.column([
            ui.when(at(1), ui.column([ui.text(Phrase.of("Choose a session"), "StepTitle"), choices], "StepBody")),
            ui.when(at(2), ui.column([ui.text(Phrase.of("Choose a day and a time"), "StepTitle"), when], "StepBody")),
            ui.when(at(3), ui.column([ui.text(Phrase.of("Your details"), "StepTitle"), details], "StepBody")),
            ui.when(at(4), ui.column([ui.text(Phrase.of("Check and confirm"), "StepTitle"), check], "StepBody")),
            // what went wrong sending, if anything
            ui.when(booking.problem.map((problem) => problem !== ""), ui.text(booking.problem, "Problem").wraps()),
            // once sent, the notice's way home is the only way on
            ui.when(booking.sent.map((sent) => !sent), ui.row([
              ui.pressable(STEPS_BACK, {}, [ui.text(Phrase.with("← %s", [ui.words(STEPS_BACK)]))], "SecondaryButton BackStep").absentWhenRefused(),
              ui.when(at(4), ui.button(REQUESTS, { style: "PrimaryButton" }), ui.button(CONTINUES, { style: "PrimaryButton" })),
            ], "StepActions")),
          ], "BookingMain"),
          // the booking so far, beside the steps until the last, which shows it all
          ui.when(booking.step.map((now) => now < BOOKING_STEPS.length), ui.column([ui.text(Phrase.of("Your booking"), "Kicker"), summary("Aside")], "BookingAside")),
        ]),
      ], "Booking"),
    ]);
  }

  summaryRow(label, value) {
    return this.ui.row([this.ui.text(label, "SummaryLabel"), this.ui.text(value, "SummaryValue").wraps()], "SummaryRow");
  }
}

// walked by its probe (?probe), the page is handed a stand-in desk, sends nothing, and shows the words here
const probing = new URLSearchParams(location.search).has("probe");
const desk = probing ? null : new Desk();
// her words and pictures, as she last saved them; the page waits for them a little, never long
if (desk) useContent(await desk.page());
document.title = SITE.name;
ChimeApp.start(ShivonneDubarry, document.getElementById("app"));
