// What the island's people say, in the browser (as on the touch screen's upper screen,
// apps/island-3ds/talk.tsx): a speech box at the bottom with the speaker's name, the line coming a
// few letters at a time, and a question's answers beside it. Space, Enter or a click shows the rest
// of the line and then the next, or takes the lit answer; the arrows move among answers, Escape is
// the last answer. Over everything while it is open (src/npc/talk.ts).

import { talk, type TalkState } from "../npc/talk.ts";
import { h } from "./dom.ts";

export function mountTalk(): HTMLElement {
  const name = h("span", { class: "talk-name" });
  const text = h("p", { class: "talk-text", "data-talk": "" });
  const more = h("i", { class: "talk-more" });
  const answers = h("div", { class: "talk-answers" });
  const box = h("div", { class: "talk-box" }, name, text, more);
  const el = h("div", { class: "talk", onclick: (e: Event) => { if (e.target === el || box.contains(e.target as Node)) talk.press(); } }, answers, box);

  let shownAnswers = "";
  const render = (s: TalkState) => {
    el.classList.toggle("open", !!s.line);
    if (!s.line) return;
    name.textContent = s.line.speaker;
    name.style.background = s.line.color;
    text.textContent = s.line.text.slice(0, Math.floor(s.shown));
    const done = s.shown >= s.line.text.length;
    more.style.visibility = done && !s.line.answers?.length ? "visible" : "hidden";
    const key = done ? `${s.line.text}|${s.answer}` : "";
    if (key === shownAnswers) return;
    shownAnswers = key;
    answers.replaceChildren(...(done ? s.line.answers ?? [] : []).map((a, k) =>
      h("button", { class: k === s.answer ? "on" : "", "data-answer": String(k), onclick: (e: Event) => { e.stopPropagation(); talk.choose(k); } }, a.label)));
  };
  talk.watch(render);

  let last = performance.now();
  const frame = (now: number) => {
    talk.tick(Math.min(0.1, (now - last) / 1000));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Before anything else hears the keys while someone is talking.
  window.addEventListener("keydown", (e) => {
    if (!talk.open) return;
    const used = ["Space", "Enter", "NumpadEnter"].includes(e.code) ? (talk.press(), true)
      : e.code === "Escape" ? (talk.back(), true)
      : e.code === "ArrowUp" || e.code === "KeyW" ? (talk.move(-1), true)
      : e.code === "ArrowDown" || e.code === "KeyS" ? (talk.move(1), true) : false;
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, { capture: true });
  return el;
}
