// What the page says and shows. She edits it in her diary's Website tab,
// which saves it on the platform (backend.sql, shivonne_dubarry_pages); the
// page reads the latest as it opens and lays it over DEFAULTS, the words
// here, which stand wherever she has written nothing (and everywhere, if the
// platform can't be reached). Everything marked placeholder is waiting for
// her own words; nothing here is written for her.
//
// useContent(saved) sets what the page uses: PAGE, the whole of it as she
// saved it, and SITE, AREAS, ABOUT, STEPS, SESSIONS, FEES_NOTE and QUESTIONS,
// the same in the shapes the page lays out. They are live: whoever imported
// them sees the new ones.

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const SOME_WORDS = `Placeholder: a sentence or two in her words. ${LOREM}`;

/** The page as she edits it: words, and her pictures by their path in the platform's pictures (empty: the placeholder). */
export const DEFAULTS = {
  name: "Shivonne Dubarry",
  disciplines: "Psychology · Anthropology · Sociology",
  headline: "Headline placeholder: who she works with, in one sentence.",
  intro: "Introduction placeholder: two or three sentences in her words on how she works and what someone can expect. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
  hero_picture: "",
  hero_alt: "",
  areas_kicker: "Who I work with",
  areas_title: "Areas placeholder: a line introducing the people she works with.",
  // from the subjects she has written on; the words under each are hers to write
  areas: [
    { name: "Migration and belonging", text: SOME_WORDS },
    { name: "Family and intergenerational trauma", text: SOME_WORDS },
    { name: "Place and ancestry", text: SOME_WORDS },
    { name: "Post-indenture histories", text: SOME_WORDS },
    { name: "Identity and indigeneity", text: SOME_WORDS },
  ],
  about_kicker: "About",
  portrait_picture: "",
  portrait_alt: "",
  about: `Biography placeholder: who she is, her background and why she does this work. ${LOREM}\n\nPlaceholder: her approach and the traditions she draws on. ${LOREM}`,
  training_title: "Training and registration",
  training: "Training placeholder: her qualifications, training and memberships.",
  how_kicker: "How I work",
  how_title: "How sessions work placeholder: a line in her words.",
  steps: [
    { name: "Get in touch", text: "Placeholder: how to make a first booking or ask a question." },
    { name: "A first session", text: "Placeholder: what happens in the first session." },
    { name: "Working together", text: "Placeholder: how sessions continue from there, and how often." },
  ],
  fees_kicker: "Fees",
  fees_title: "Sessions and fees",
  // the two kinds a visitor can book (backend.sql holds a request to these ids)
  sessions: {
    consultation: { name: "Initial consultation", minutes: 50, fee: "Fee placeholder", text: "Placeholder: what the first session is for." },
    individual: { name: "Individual session", minutes: 50, fee: "Fee placeholder", text: "Placeholder: an ongoing session." },
  },
  fees_note: "Placeholder: cancellation policy, reduced-fee places, and any rebates or insurance.",
  questions_kicker: "Questions",
  questions_title: "Common questions",
  questions: [
    { question: "Is what I say confidential?", answer: "Answer placeholder: confidentiality and its limits, in her words." },
    { question: "How do online sessions work?", answer: "Answer placeholder: how online sessions work." },
    { question: "How many sessions will I need?", answer: "Answer placeholder: how long people usually work with her." },
    { question: "What if I'm not sure counselling is for me?", answer: "Answer placeholder: what she suggests for someone unsure." },
    { question: "How do I cancel or move a session?", answer: "Answer placeholder: her cancellation policy." },
  ],
  invitation_title: "When you're ready",
  invitation_text: "Placeholder: a line inviting people to book, in her words.",
  credentials: "Credentials placeholder: her qualifications.",
  email: "hello@example.com",
  location: "Location placeholder: where she is based. Sessions are online.",
  registration: "Registration placeholder: her professional body and registration number.",
  crisis: "This page and its booking are not for emergencies. If you are in crisis or at risk, call your local emergency number. Crisis line placeholder: the number to call where she practises.",
  land: "Land acknowledgement placeholder: her words, if she chooses to include one.",
};

export const SESSION_IDS = Object.keys(DEFAULTS.sessions);
export const LIMITS = { words: 4000, list: 30, minutes: [10, 240] };
// a picture's path in the platform's pictures: her folder, then its name
export const PICTURE_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/;

const words = (given, fallback) => (typeof given === "string" ? given.slice(0, LIMITS.words) : fallback);
const pairs = (given, fallback, keys) => (Array.isArray(given)
  ? given.filter((item) => item && typeof item === "object").slice(0, LIMITS.list).map((item) => Object.fromEntries(keys.map((key) => [key, words(item[key], "")])))
  : fallback.map((item) => ({ ...item })));

/** What she saved, laid over the defaults: every part checked, anything missing or malformed the default's. */
export function merged(saved) {
  const from = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  const made = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) if (typeof fallback === "string") made[key] = words(from[key], fallback);
  for (const key of ["hero_picture", "portrait_picture"]) if (!PICTURE_PATH.test(made[key])) made[key] = "";
  made.areas = pairs(from.areas, DEFAULTS.areas, ["name", "text"]);
  made.questions = pairs(from.questions, DEFAULTS.questions, ["question", "answer"]);
  made.steps = DEFAULTS.steps.map((step, index) => {
    const given = Array.isArray(from.steps) ? from.steps[index] : null;
    return { name: words(given?.name, step.name), text: words(given?.text, step.text) };
  });
  made.sessions = Object.fromEntries(SESSION_IDS.map((id) => {
    const fallback = DEFAULTS.sessions[id];
    const given = from.sessions?.[id] ?? {};
    const minutes = Number.isInteger(given.minutes) && given.minutes >= LIMITS.minutes[0] && given.minutes <= LIMITS.minutes[1] ? given.minutes : fallback.minutes;
    return [id, { name: words(given.name, fallback.name), minutes, fee: words(given.fee, fallback.fee), text: words(given.text, fallback.text) }];
  }));
  return made;
}

export let PAGE;
export let SITE;
export let AREAS;
export let ABOUT;
export let STEPS;
export let SESSIONS;
export let FEES_NOTE;
export let QUESTIONS;

/** The page to show: what she saved (or nothing, for the defaults). */
export function useContent(saved) {
  PAGE = merged(saved);
  SITE = {
    name: PAGE.name,
    disciplines: PAGE.disciplines.split(/\s*[·,]\s*/).filter(Boolean),
    headline: PAGE.headline,
    intro: PAGE.intro,
    credentials: PAGE.credentials,
    email: PAGE.email,
    location: PAGE.location,
    registration: PAGE.registration,
    crisis: PAGE.crisis,
    land: PAGE.land,
  };
  AREAS = PAGE.areas.map((area, index) => ({ id: `area_${index + 1}`, ...area }));
  ABOUT = { paragraphs: paragraphs(PAGE.about), training: PAGE.training };
  STEPS = PAGE.steps;
  SESSIONS = SESSION_IDS.map((id) => ({ id, ...PAGE.sessions[id] }));
  FEES_NOTE = PAGE.fees_note;
  QUESTIONS = PAGE.questions.map((item) => [item.question, item.answer]);
}

/** Words cut into paragraphs at each blank line. */
export function paragraphs(text) {
  return String(text).split(/\n\s*\n/).map((each) => each.trim()).filter(Boolean);
}

useContent(null);
